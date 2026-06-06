import { X } from 'lucide-react'
import type { Toast } from 'react-hot-toast'
import toast from 'react-hot-toast'

type Props = {
  t: Toast;
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning';
}

export function NotificationToast({ t, title, message, type = 'info' }: Props) {
  const getColors = () => {
    switch (type) {
      case 'success': return 'bg-white border-primary/20 text-text-primary'
      case 'warning': return 'bg-[#FAEEDA] border-[#FAC775] text-[#854F0B]'
      case 'info':
      default:
        return 'bg-bg-surface border-border-base text-text-primary'
    }
  }

  return (
    <div
      className={`max-w-md w-full shadow-lg rounded-none pointer-events-auto flex ring-1 ring-black ring-opacity-5 ${getColors()} ${
        t.visible ? 'animate-enter' : 'animate-leave'
      }`}
    >
      <div className="flex-1 w-0 p-4">
        <div className="flex items-start">
          <div className="ml-3 flex-1">
            <p className="text-sm font-medium">
              {title}
            </p>
            <p className="mt-1 text-xs opacity-90">
              {message}
            </p>
          </div>
        </div>
      </div>
      <div className="flex border-l border-border-base">
        <button
          onClick={() => toast.dismiss(t.id)}
          className="w-full border border-transparent rounded-none p-4 flex items-center justify-center text-sm font-medium hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
