'use client'
// Ask about your jobs (14 Nov 2026) — app/components/garden/AskScreen.
import AskScreen from '@/app/components/garden/AskScreen'
import { RoleTabBar } from '@/app/components/RoleTabBar'
export default function ContractorAsk() { return <><AskScreen role="contractor" /><RoleTabBar role="contractor" active={'ask' as any} spacer={false} /></> }
