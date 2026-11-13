import { describe, it, expect, vi } from 'vitest'

vi.mock('@/firebase/complaintId', () => ({
  getDisplayId: (complaint) => complaint.complaintId || complaint.id || '',
}))

import { matchesComplaintSearch } from './complaintSearch'

const complaint = {
  complaintId: 'CMP-12345',
  title: 'Broken streetlight',
  category: 'Streetlight Issues',
  address: 'Jaipur',
}

describe('matchesComplaintSearch', () => {
  it('matches a complaint by tracking ID', () => {
    expect(matchesComplaintSearch(complaint, 'CMP-12345')).toBe(true)
  })

  it('matches a complaint by title', () => {
    expect(matchesComplaintSearch(complaint, 'streetlight')).toBe(true)
  })

  it('matches a complaint by category', () => {
    expect(matchesComplaintSearch(complaint, 'Streetlight Issues')).toBe(true)
  })

  it('matches without case sensitivity', () => {
    expect(matchesComplaintSearch(complaint, 'BROKEN STREETLIGHT')).toBe(true)
  })

  it('matches by address', () => {
    expect(matchesComplaintSearch(complaint, 'Jaipur')).toBe(true)
  })

  it('matches reporter details', () => {
    expect(
      matchesComplaintSearch(complaint, 'citizen@example.com', {
        email: 'citizen@example.com',
      })
    ).toBe(true)
  })

  it('returns false when there is no match', () => {
    expect(matchesComplaintSearch(complaint, 'Electricity')).toBe(false)
  })

  it('returns true for an empty search', () => {
    expect(matchesComplaintSearch(complaint, '')).toBe(true)
  })
})