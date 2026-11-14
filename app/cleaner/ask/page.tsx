'use client'
// Ask about your houses (14 Nov 2026) — app/components/garden/AskScreen.
import AskScreen from '@/app/components/garden/AskScreen'
import { RoleTabBar } from '@/app/components/RoleTabBar'
export default function CleanerAsk() { return <><AskScreen role="cleaner" /><RoleTabBar role="cleaner" active={'ask' as any} spacer={false} /></> }
