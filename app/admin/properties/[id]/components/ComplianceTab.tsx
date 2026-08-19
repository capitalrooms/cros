'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

interface Certificate {
  label: string
  expiryKey: string
}

interface Policy {
  id: string
  policy_type: string
  appliance_type?: string
  appliances_covered?: string[]
  provider_name: string
  policy_number: string
  monthly_cost: number
  renewal_date?: string
}

interface ComplianceTabProps {
  property: any
}

export default function ComplianceTab({ property }: ComplianceTabProps) {
  const [policies, setPolicies] = useState<Policy[]>([])
  const [loading, setLoading] = useState(true)
  const [isAddingPolicy, setIsAddingPolicy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    policy_type: 'appliance',
    appliance_type: '',
    provider_name: '',
    policy_number: '',
    monthly_cost: '0',
    renewal_date: ''
  })

  const supabase = createClient()

  useEffect(() => {
    loadPolicies()
  }, [property.id])

  async function loadPolicies() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('property_policies')
      .select('*')
      .eq('property_id', property.id)
      .order('policy_type', { ascending: true })

    if (err) {
      console.error(err)
    } else {
      setPolicies(data || [])
    }
    setLoading(false)
  }

  async function handleAddPolicy() {
    if (!formData.provider_name.trim() || !formData.policy_number.trim()) {
      setError('Provider name and policy number are required')
      return
    }

    const { data, error: err } = await supabase
      .from('property_policies')
      .insert({
        property_id: property.id,
        policy_type: formData.policy_type,
        appliance_type: formData.appliance_type || null,
        provider_name: formData.provider_name,
        policy_number: formData.policy_number,
        monthly_cost: parseFloat(formData.monthly_cost) || 0,
        renewal_date: formData.renewal_date || null
      })
      .select()

    if (err) {
      setError('Failed to add policy')
      console.error(err)
      return
    }

    if (data) {
      setPolicies([...policies, data[0]])
      setFormData({
        policy_type: 'appliance',
        appliance_type: '',
        provider_name: '',
        policy_number: '',
        monthly_cost: '0',
        renewal_date: ''
      })
      setIsAddingPolicy(false)
      setSuccess('Policy added')
      setTimeout(() => setSuccess(null), 3000)
    }
  }

  async function handleDeletePolicy(policyId: string) {
    if (!confirm('Delete this policy?')) return

    const { error: err } = await supabase
      .from('property_policies')
      .delete()
      .eq('id', policyId)

    if (err) {
      setError('Failed to delete policy')
      console.error(err)
      return
    }

    setPolicies(policies.filter(p => p.id !== policyId))
    setSuccess('Policy deleted')
    setTimeout(() => setSuccess(null), 3000)
  }

  const certificateList: Certificate[] = [
    { label: 'Gas Safety Certificate (CP12)', expiryKey: 'gas_safe_cert_expiry' },
    { label: 'EICR (Electrical Inspection)', expiryKey: 'electrical_cert_expiry' },
    { label: 'PAT (Portable Appliance Testing)', expiryKey: 'pat_test_expiry' },
    { label: 'Fire Detection / Alarm', expiryKey: 'fire_detection_expiry' },
    { label: 'Emergency Lighting', expiryKey: 'emergency_lighting_expiry' },
    { label: 'Fire Risk Assessment', expiryKey: 'fire_risk_assessment_expiry' },
  ]

  const isExpired = (expiryDate: string) => {
    if (!expiryDate) return false
    return new Date(expiryDate) < new Date()
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleDateString('en-GB')
  }

  const totalMonthlyCost = policies.reduce((sum, p) => sum + (p.monthly_cost || 0), 0)
  const appliancePolicies = policies.filter(p => p.policy_type === 'appliance')
  const buildingPolicies = policies.filter(p => p.policy_type === 'building')
  const liabilityPolicies = policies.filter(p => p.policy_type === 'liability')

  const isRenewalSoon = (renewalDate: string) => {
    if (!renewalDate) return false
    const daysUntilRenewal = Math.floor((new Date(renewalDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    return daysUntilRenewal <= 30 && daysUntilRenewal >= 0
  }

  const isRenewalExpired = (renewalDate: string) => {
    if (!renewalDate) return false
    return new Date(renewalDate) < new Date()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-xl">
        <div className="text-sm text-neutral-400">Loading compliance data...</div>
      </div>
    )
  }

  return (
    <div className="space-y-3xl">
      {error && (
        <div className="p-lg rounded-lg bg-red-950 border border-red-800">
          <p className="text-sm font-semibold text-red-400">{error}</p>
        </div>
      )}
      {success && (
        <div className="p-lg rounded-lg bg-green-950 border border-green-800">
          <p className="text-sm font-semibold text-green-400">✓ {success}</p>
        </div>
      )}

      {/* Annual Testing & Certificates */}
      <div>
        <h3 className="text-sm font-bold uppercase text-neutral-400 mb-lg pb-lg border-b border-neutral-100">
          Annual Testing & Certificates
        </h3>
        <div className="space-y-md">
          {certificateList.map(({ label, expiryKey }) => {
            const expiryDate = (property as any)[expiryKey]
            const expired = isExpired(expiryDate)
            return (
              <div
                key={expiryKey}
                className={`rounded-lg border p-lg transition ${
                  expired ? 'border-red-800 bg-red-950' : 'border-neutral-700 bg-neutral-950'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">{label}</span>
                  <span
                    className={`text-xs font-semibold px-md py-sm rounded-full ${
                      expired
                        ? 'bg-red-100 text-red-700'
                        : expiryDate
                        ? 'bg-green-100 text-green-700'
                        : 'bg-neutral-900 text-neutral-400'
                    }`}
                  >
                    {expiryDate ? formatDate(expiryDate) : 'Not set'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Policies & Coverage */}
      <div>
        <div className="flex items-center justify-between mb-lg pb-lg border-b border-neutral-100">
          <h3 className="text-sm font-bold uppercase text-neutral-400">
            💰 Policies & Coverage
          </h3>
          <button
            onClick={() => setIsAddingPolicy(true)}
            className="px-lg py-md bg-blue-600 text-white rounded-lg font-semibold text-xs hover:bg-blue-700 transition"
          >
            + Add Policy
          </button>
        </div>

        {/* Total Monthly Cost */}
        {(appliancePolicies.length > 0 || buildingPolicies.length > 0 || liabilityPolicies.length > 0) && (
          <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-lg mb-lg">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-400">Total Monthly Cost</p>
            <p className="text-3xl font-bold text-blue-300 mt-sm">£{totalMonthlyCost.toFixed(2)}</p>
          </div>
        )}

        {/* Add Policy Modal */}
        {isAddingPolicy && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-lg">
            <div className="bg-neutral-950 rounded-xl shadow-lg p-lg max-w-md w-full">
              <h3 className="text-lg font-semibold text-white mb-lg">Add New Policy</h3>

              <div className="space-y-lg">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                    Policy Type
                  </label>
                  <select
                    value={formData.policy_type}
                    onChange={(e) => setFormData({ ...formData, policy_type: e.target.value })}
                    className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="appliance">Appliance Policy</option>
                    <option value="building">Building Insurance</option>
                    <option value="liability">Liability Insurance</option>
                  </select>
                </div>

                {formData.policy_type === 'appliance' && (
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                      Appliance Type
                    </label>
                    <input
                      type="text"
                      value={formData.appliance_type}
                      onChange={(e) => setFormData({ ...formData, appliance_type: e.target.value })}
                      placeholder="e.g., Boiler, Kitchen Appliances"
                      className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                    Provider Name *
                  </label>
                  <input
                    type="text"
                    value={formData.provider_name}
                    onChange={(e) => setFormData({ ...formData, provider_name: e.target.value })}
                    placeholder="e.g., British Gas"
                    className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                    Policy Number *
                  </label>
                  <input
                    type="text"
                    value={formData.policy_number}
                    onChange={(e) => setFormData({ ...formData, policy_number: e.target.value })}
                    placeholder="e.g., GB123456"
                    className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                    Monthly Cost (£)
                  </label>
                  <input
                    type="number"
                    value={formData.monthly_cost}
                    onChange={(e) => setFormData({ ...formData, monthly_cost: e.target.value })}
                    placeholder="25.50"
                    className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    step="0.01"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                    Renewal Date
                  </label>
                  <input
                    type="date"
                    value={formData.renewal_date}
                    onChange={(e) => setFormData({ ...formData, renewal_date: e.target.value })}
                    className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex gap-md mt-lg">
                <button
                  onClick={() => {
                    setIsAddingPolicy(false)
                    setError(null)
                  }}
                  className="flex-1 px-lg py-md border border-neutral-700 text-white rounded-lg font-semibold text-sm hover:bg-neutral-900 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddPolicy}
                  className="flex-1 px-lg py-md bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition"
                >
                  Add Policy
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Appliance Policies */}
        {appliancePolicies.length > 0 && (
          <div className="mb-lg">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-md">Appliance Policies</h4>
            <div className="space-y-md">
              {appliancePolicies.map((policy) => (
                <div key={policy.id} className="rounded-lg border border-neutral-700 bg-neutral-950 p-lg">
                  <div className="flex items-start justify-between gap-lg mb-md">
                    <div className="flex-1">
                      <p className="font-semibold text-white">
                        {policy.appliance_type || 'Appliance Policy'}
                      </p>
                      <p className="text-xs text-neutral-400 mt-xs">{policy.provider_name}</p>
                    </div>
                    <button
                      onClick={() => handleDeletePolicy(policy.id)}
                      className="text-xs font-semibold text-red-400 hover:text-red-400"
                    >
                      Delete
                    </button>
                  </div>

                  <div className="space-y-sm text-xs">
                    <div className="flex justify-between">
                      <span className="text-neutral-400">Policy #:</span>
                      <span className="font-semibold text-white">{policy.policy_number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-400">Monthly Cost:</span>
                      <span className="font-semibold text-blue-400">£{policy.monthly_cost.toFixed(2)}</span>
                    </div>
                    {policy.renewal_date && (
                      <div className="flex justify-between">
                        <span className="text-neutral-400">Renewal:</span>
                        <span className={`font-semibold ${isRenewalExpired(policy.renewal_date) ? 'text-red-400' : isRenewalSoon(policy.renewal_date) ? 'text-amber-600' : 'text-green-600'}`}>
                          {formatDate(policy.renewal_date)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Building & Liability Policies */}
        {[...buildingPolicies, ...liabilityPolicies].length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-md">Insurance Policies</h4>
            <div className="space-y-md">
              {[...buildingPolicies, ...liabilityPolicies].map((policy) => (
                <div key={policy.id} className="rounded-lg border border-neutral-700 bg-neutral-950 p-lg">
                  <div className="flex items-start justify-between gap-lg mb-md">
                    <div className="flex-1">
                      <p className="font-semibold text-white">
                        {policy.policy_type === 'building' ? 'Building Insurance' : 'Liability Insurance'}
                      </p>
                      <p className="text-xs text-neutral-400 mt-xs">{policy.provider_name}</p>
                    </div>
                    <button
                      onClick={() => handleDeletePolicy(policy.id)}
                      className="text-xs font-semibold text-red-400 hover:text-red-400"
                    >
                      Delete
                    </button>
                  </div>

                  <div className="space-y-sm text-xs">
                    <div className="flex justify-between">
                      <span className="text-neutral-400">Policy #:</span>
                      <span className="font-semibold text-white">{policy.policy_number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-400">Monthly Cost:</span>
                      <span className="font-semibold text-blue-400">£{policy.monthly_cost.toFixed(2)}</span>
                    </div>
                    {policy.renewal_date && (
                      <div className="flex justify-between">
                        <span className="text-neutral-400">Renewal:</span>
                        <span className={`font-semibold ${isRenewalExpired(policy.renewal_date) ? 'text-red-400' : isRenewalSoon(policy.renewal_date) ? 'text-amber-600' : 'text-green-600'}`}>
                          {formatDate(policy.renewal_date)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {policies.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-neutral-700 bg-neutral-900 p-xl text-center">
            <p className="text-sm text-neutral-400">No policies added yet</p>
            <button
              onClick={() => setIsAddingPolicy(true)}
              className="text-xs font-semibold text-blue-400 hover:text-blue-300 underline mt-md"
            >
              Add your first policy
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
