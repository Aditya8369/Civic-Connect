export function getComplaintEditError({ title, description, address }) {
  for (const [field, value] of Object.entries({ title, description, address })) {
    if (typeof value !== 'string' || !value.trim()) return `Please enter a complaint ${field}`
  }
  return null
}
