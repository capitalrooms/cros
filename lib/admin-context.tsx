'use client'

import { createContext, useContext } from 'react'

export const AdminContext = createContext(false)

export function useIsAdmin() {
  return useContext(AdminContext)
}

/** Which office pages the signed-in person may open (their access areas — set by the admin layout). */
export const AdminAccessContext = createContext<(href: string) => boolean>(() => true)
export const useAdminAccess = () => useContext(AdminAccessContext)
