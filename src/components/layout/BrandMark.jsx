import { useNavigate } from 'react-router-dom'

export default function BrandMark() {
  const navigate = useNavigate()

  return (
    <a
      href="/"
      onClick={(e) => {
        e.preventDefault()
        navigate('/')
      }}
      aria-label="Civic-Connect home"
      className="flex items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
    >
      <span className="relative grid h-8 w-8 place-items-center rounded-xl bg-emerald-600 text-sm font-bold text-white">
        C
        <span
          role="img"
          aria-label="Service online"
          className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-green-400 dark:border-gray-950"
        />
      </span>
      <span className="hidden text-base font-semibold tracking-tight text-gray-900 sm:inline dark:text-gray-100">
        Civic-Connect
      </span>
    </a>
  )
}