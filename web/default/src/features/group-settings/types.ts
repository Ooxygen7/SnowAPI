export interface GroupProfile {
  is_default?: boolean
  name: string
  description: string
  max_requests: number
  max_successful_requests: number
  period_minutes: number
  concurrency_limit: number
  tpm_limit: number
}

export interface GroupProfilesResponse {
  success: boolean
  message?: string
  data?: GroupProfile[]
}
