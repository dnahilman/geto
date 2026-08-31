export type Person = {
  id: string
  firstName: string
  lastName: string
  age: number
  visits: number
  progress: number
  status: 'relationship' | 'complicated' | 'single'
  createdAt: string
}

const firstNames = [
  'James',
  'Mary',
  'John',
  'Patricia',
  'Robert',
  'Jennifer',
  'Michael',
  'Linda',
  'William',
  'Elizabeth',
]
const lastNames = [
  'Smith',
  'Johnson',
  'Williams',
  'Brown',
  'Jones',
  'Garcia',
  'Miller',
  'Davis',
  'Rodriguez',
  'Martinez',
]
const statuses: Array<Person['status']> = ['relationship', 'complicated', 'single']

export const newPerson = (id?: string): Person => {
  const randFirst = firstNames[Math.floor(Math.random() * firstNames.length)] ?? 'User'
  const randLast = lastNames[Math.floor(Math.random() * lastNames.length)] ?? 'Demo'
  const randStatus = statuses[Math.floor(Math.random() * statuses.length)] ?? 'single'
  const now = new Date(Date.now() - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000))
  const formatted = now.toISOString().replace('T', ' ').slice(0, 19)

  return {
    id:
      id ??
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2)),
    firstName: randFirst,
    lastName: randLast,
    age: Math.floor(Math.random() * 40) + 18,
    visits: Math.floor(Math.random() * 1000),
    progress: Math.floor(Math.random() * 100),
    status: randStatus,
    createdAt: formatted,
  }
}

export function makeData(count = 500): Array<Person> {
  const arr: Array<Person> = []
  for (let i = 0; i < count; i++) {
    arr.push(newPerson())
  }
  return arr
}

// In-memory mock database for server-side queries
let globalDb: Person[] = makeData(500)

export function getGlobalDb(): Person[] {
  return globalDb
}

export function resetGlobalDb(count = 500): Person[] {
  globalDb = makeData(count)
  return globalDb
}

export function fetchGridData(params: { pageIndex: number; pageSize: number }) {
  const { pageIndex, pageSize } = params
  const totalCount = globalDb.length
  const pageCount = Math.ceil(totalCount / pageSize)
  const start = pageIndex * pageSize
  const end = start + pageSize
  const data = globalDb.slice(start, end)

  return {
    data,
    totalCount,
    pageCount,
    pageIndex,
    pageSize,
  }
}
