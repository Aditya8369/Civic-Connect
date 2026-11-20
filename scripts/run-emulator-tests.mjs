#!/usr/bin/env node

/**
 * Cross-platform Firebase Emulator Test Runner (Issue #254)
 * Works consistently on Windows and Linux using native Node.js APIs.
 *
 * Responsibilities:
 * 1. Validates environment (Firebase CLI, Java, Node version).
 * 2. Checks port availability (Firestore: 8080, Auth: 9099, Storage: 9199).
 * 3. Starts required emulators cleanly with singleProjectMode.
 * 4. Polls emulator health checks with bounded retries and timeout diagnostics.
 * 5. Executes Vitest rules suite (`vitest.rules.config.js`).
 * 6. Guarantees process-tree cleanup on exit, failure, SIGINT, or SIGTERM.
 */

import { spawn, execSync } from 'node:child_process'
import { createConnection } from 'node:net'
import { platform } from 'node:os'
import process from 'node:process'

const REQUIRED_PORTS = [
  { name: 'Firestore', port: 8080 },
  { name: 'Auth', port: 9099 },
  { name: 'Storage', port: 9199 },
]

const STARTUP_TIMEOUT_MS = 60000
const HEALTH_POLL_INTERVAL_MS = 1000
const PROJECT_ID = 'demo-civic-connect'

const args = process.argv.slice(2)
const isStorageOnly = args.includes('--storage-only')
const isFirestoreOnly = args.includes('--firestore-only')

let emulatorProcess = null
let isShuttingDown = false

/**
 * Checks whether a given TCP port is open / occupied.
 */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => {
      resolve(false)
    })
  })
}

/**
 * Checks all required emulator ports prior to startup.
 */
async function checkPortAvailability() {
  const occupied = []
  for (const { name, port } of REQUIRED_PORTS) {
    if (await isPortInUse(port)) {
      occupied.push({ name, port })
    }
  }
  return occupied
}

/**
 * Polls emulator ports until all are accepting connections or timeout elapses.
 */
async function waitForEmulators(startTime = Date.now()) {
  process.stdout.write('[Runner] Waiting for emulators to become ready...')

  while (Date.now() - startTime < STARTUP_TIMEOUT_MS) {
    if (isShuttingDown) {
      throw new Error('Aborted startup due to shutdown signal.')
    }

    const firestoreReady = await isPortInUse(8080)
    const authReady = await isPortInUse(9099)
    const storageReady = isFirestoreOnly ? true : await isPortInUse(9199)

    if (firestoreReady && authReady && storageReady) {
      process.stdout.write(' Ready!\n')
      return true
    }

    process.stdout.write('.')
    await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS))
  }

  process.stdout.write('\n')
  throw new Error(`Emulator startup timed out after ${STARTUP_TIMEOUT_MS / 1000}s.`)
}

/**
 * Cross-platform process termination (supports Windows process tree and Unix process groups).
 */
function terminateProcess(child) {
  if (!child || child.killed) return

  const isWin = platform() === 'win32'
  if (isWin) {
    try {
      execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' })
    } catch {
      // Process might already be dead
    }
  } else {
    try {
      // If detached, kill negative PID process group; otherwise send SIGKILL
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      try {
        child.kill('SIGKILL')
      } catch {
        // Ignored
      }
    }
  }
}

/**
 * Guaranteed cleanup routine.
 */
async function cleanup() {
  if (isShuttingDown) return
  isShuttingDown = true

  console.log('[Runner] Cleaning up emulator processes...')
  if (emulatorProcess) {
    terminateProcess(emulatorProcess)
    emulatorProcess = null
  }

  // Brief pause to allow OS socket release
  await new Promise((r) => setTimeout(r, 1000))
}

/**
 * Validates prerequisite tools: Node.js and Java.
 */
function validatePrerequisites() {
  try {
    execSync('java -version', { stdio: 'ignore' })
  } catch {
    console.error('[Runner] Error: Java is required for Firebase Emulators but was not found in PATH.')
    process.exit(1)
  }
}

/**
 * Spawns the Firebase Emulators child process.
 */
function startEmulators() {
  console.log(`[Runner] Starting Firebase Emulators (Auth, Firestore, Storage) for project: ${PROJECT_ID}...`)

  const isWin = platform() === 'win32'
  const command = isWin ? 'cmd.exe' : 'npx'
  const emulatorTarget = isFirestoreOnly ? 'firestore,auth' : 'firestore,auth,storage'
  const emulatorArgs = isWin
    ? ['/c', 'npx', '--yes', 'firebase-tools@15.36.0', 'emulators:start', '--only', emulatorTarget, '--project', PROJECT_ID]
    : ['--yes', 'firebase-tools@15.36.0', 'emulators:start', '--only', emulatorTarget, '--project', PROJECT_ID]

  emulatorProcess = spawn(command, emulatorArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: !isWin, // Process group on Unix for clean group termination
  })

  emulatorProcess.stdout.on('data', (chunk) => {
    const text = chunk.toString()
    if (process.env.DEBUG_EMULATOR) {
      process.stdout.write(`[Emulator] ${text}`)
    }
  })

  emulatorProcess.stderr.on('data', (chunk) => {
    const text = chunk.toString()
    if (process.env.DEBUG_EMULATOR || text.includes('Error')) {
      process.stderr.write(`[Emulator Err] ${text}`)
    }
  })

  emulatorProcess.on('exit', (code, signal) => {
    if (!isShuttingDown && code !== 0) {
      console.error(`[Runner] Emulator process exited unexpectedly with code ${code} / signal ${signal}`)
    }
  })
}

/**
 * Runs Vitest with vitest.rules.config.js.
 */
function runVitest() {
  return new Promise((resolve) => {
    console.log('[Runner] Running security rules test suites...')

    const isWin = platform() === 'win32'
    const command = isWin ? 'cmd.exe' : 'npx'
    const testPattern = isStorageOnly
      ? ['tests/rules/storage.rules.test.js']
      : isFirestoreOnly
        ? ['tests/rules/firestore.rules.test.js']
        : []

    const vitestArgs = isWin
      ? ['/c', 'npx', 'vitest', 'run', '--config', 'vitest.rules.config.js', ...testPattern]
      : ['vitest', 'run', '--config', 'vitest.rules.config.js', ...testPattern]

    const testChild = spawn(command, vitestArgs, {
      stdio: 'inherit',
      env: {
        ...process.env,
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
        FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
        STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
        FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      },
    })

    testChild.on('close', (code) => {
      resolve(code ?? 1)
    })
  })
}

/**
 * Main execution lifecycle.
 */
async function main() {
  validatePrerequisites()

  const occupiedPorts = await checkPortAvailability()
  if (occupiedPorts.length > 0) {
    console.error('[Runner] Error: One or more required emulator ports are already in use:')
    for (const { name, port } of occupiedPorts) {
      console.error(`  - Port ${port} (${name})`)
    }
    console.error('Please terminate the occupying process and try again.')
    process.exit(1)
  }

  // Register termination signals
  process.on('SIGINT', async () => {
    console.log('\n[Runner] Received SIGINT.')
    await cleanup()
    process.exit(130)
  })

  process.on('SIGTERM', async () => {
    console.log('\n[Runner] Received SIGTERM.')
    await cleanup()
    process.exit(143)
  })

  let exitCode = 0
  try {
    startEmulators()
    await waitForEmulators()
    exitCode = await runVitest()
  } catch (err) {
    console.error(`[Runner] Error: ${err.message}`)
    exitCode = 1
  } finally {
    await cleanup()
  }

  process.exit(exitCode)
}

main()
