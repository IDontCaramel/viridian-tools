// tiny inline icon set so the ui doesn't depend on unicode glyphs rendering the same everywhere
import type { ReactNode, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function icon(paths: ReactNode) {
  return function Icon({ size = 16, ...props }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        className="icon"
        {...props}
      >
        {paths}
      </svg>
    )
  }
}

export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />)
export const UndoIcon = icon(
  <>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </>,
)
export const RedoIcon = icon(
  <>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </>,
)
export const DownloadIcon = icon(
  <>
    <path d="M12 4v11" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 20h14" />
  </>,
)
export const UploadIcon = icon(
  <>
    <path d="M12 16V5" />
    <path d="m7 10 5-5 5 5" />
    <path d="M5 20h14" />
  </>,
)
export const FolderIcon = icon(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />)
export const SettingsIcon = icon(
  <>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </>,
)
export const OriginIcon = icon(<path d="M12 3 21 12 12 21 3 12Z" />)
export const LayerIcon = icon(
  <>
    <path d="m12 3 9 5-9 5-9-5Z" />
    <path d="m3 13 9 5 9-5" />
  </>,
)
export const PowerIcon = icon(<path d="M13 3 5 13.5h6L10 21l8-10.5h-6Z" />)
export const SparkIcon = icon(
  <path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7Z" />,
)
export const CloseIcon = icon(<path d="M6 6l12 12M18 6 6 18" />)
export const TrashIcon = icon(
  <>
    <path d="M4 7h16" />
    <path d="M9 7V4h6v3" />
    <path d="M6 7l1 13h10l1-13" />
  </>,
)
export const ArrowUpIcon = icon(<path d="M12 19V5M6 11l6-6 6 6" />)
export const ArrowDownIcon = icon(<path d="M12 5v14M6 13l6 6 6-6" />)
export const ChevronRightIcon = icon(<path d="m9 6 6 6-6 6" />)
export const ChevronDownIcon = icon(<path d="m6 9 6 6 6-6" />)
export const SoundIcon = icon(<path d="M4 9v6h4l5 4V5L8 9Z M16.5 8.5a5 5 0 0 1 0 7 M19 6a8.5 8.5 0 0 1 0 12" />)
export const GripIcon = icon(
  <>
    <circle cx="9" cy="6" r=".9" fill="currentColor" />
    <circle cx="15" cy="6" r=".9" fill="currentColor" />
    <circle cx="9" cy="12" r=".9" fill="currentColor" />
    <circle cx="15" cy="12" r=".9" fill="currentColor" />
    <circle cx="9" cy="18" r=".9" fill="currentColor" />
    <circle cx="15" cy="18" r=".9" fill="currentColor" />
  </>,
)
