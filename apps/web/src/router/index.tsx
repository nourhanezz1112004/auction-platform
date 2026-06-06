import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { RootLayout } from '@/components/layout/RootLayout'
import { ProtectedRoute } from './ProtectedRoute'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { HomePage } from '@/pages/HomePage'
import { AuctionDetailPage } from '@/pages/AuctionDetailPage'
import { SearchPage } from '@/pages/SearchPage'
import { CreateListingPage } from '@/pages/CreateListingPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { WatchlistPage } from '@/pages/WatchlistPage'
import { AdminPage } from '@/pages/AdminPage'
import { PaymentPage } from '@/pages/PaymentPage'
import { PaymentSuccessPage } from '@/pages/PaymentSuccessPage'
import { PaymentCancelPage } from '@/pages/PaymentCancelPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

import { SellerProfilePage } from '@/pages/SellerProfilePage'

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },
  {
    path: '/forgot-password',
    element: <ForgotPasswordPage />,
  },
  {
    path: '/reset-password',
    element: <ResetPasswordPage />,
  },
  {
    path: '/',
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: 'auctions/:id',
        element: <AuctionDetailPage />,
      },
      {
        path: 'auctions/:id/pay',
        element: (
          <ProtectedRoute>
            <PaymentPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'search',
        element: <SearchPage />,
      },
      {
        path: 'seller/:id',
        element: <SellerProfilePage />,
      },
      {
        path: 'sell',
        element: (
          <ProtectedRoute>
            <CreateListingPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'profile',
        element: (
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'watchlist',
        element: (
          <ProtectedRoute>
            <WatchlistPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin',
        element: (
          <ProtectedRoute requireAdmin>
            <AdminPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'payment/success',
        element: (
          <ProtectedRoute>
            <PaymentSuccessPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'payment/cancel/:id?',
        element: (
          <ProtectedRoute>
            <PaymentCancelPage />
          </ProtectedRoute>
        ),
      },
      {
        path: '*',
        element: <NotFoundPage />,
      }
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
