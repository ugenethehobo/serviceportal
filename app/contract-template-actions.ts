'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import {
  loadContractTemplateById,
  loadContractTemplatesPageData,
  createServicePackageContractTemplate,
  deleteServicePackageContractTemplate,
  resetContractTemplateRecord,
  updateContractTemplateRecord,
} from '@/lib/contract-templates-server'
import type { DocumentTemplate } from '@/lib/document-template'
import { normalizeDocumentTemplate } from '@/lib/document-template'
import {
  getSessionProfile,
  isStaffRole,
  TRIAL_EXPIRED_ERROR,
  verifyStaffSubscriptionAccess,
} from '@/lib/portal-auth'

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function verifyCompanyAdminForContractTemplates() {
  const session = await getSessionProfile()
  if (!session) {
    return { ok: false as const, error: 'Not authenticated' }
  }
  if (!session.profile.company_id) {
    return { ok: false as const, error: 'No company associated with this account' }
  }
  if (!isStaffRole(session.profile.role)) {
    return { ok: false as const, error: 'Unauthorized' }
  }

  const subscription = await verifyStaffSubscriptionAccess(session.profile.company_id)
  if (!subscription.ok) {
    return { ok: false as const, error: TRIAL_EXPIRED_ERROR }
  }

  if (session.profile.role !== 'company_admin') {
    return {
      ok: false as const,
      error: 'Only company admins can manage contract templates',
    }
  }

  return {
    ok: true as const,
    companyId: session.profile.company_id,
  }
}

export async function getContractTemplatesPageDataAction(): Promise<
  | { success: true; data: Awaited<ReturnType<typeof loadContractTemplatesPageData>> }
  | { success: false; error: string }
> {
  const check = await verifyCompanyAdminForContractTemplates()
  if (!check.ok) return { success: false, error: check.error }

  try {
    const supabaseAdmin = createSupabaseAdmin()
    const data = await loadContractTemplatesPageData(supabaseAdmin, check.companyId)
    return { success: true, data }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load contract templates'
    if (message.includes('42P01')) {
      return {
        success: false,
        error: 'Contracts are not enabled yet. Run supabase/contracts-schema.sql.',
      }
    }
    return { success: false, error: message }
  }
}

export async function getContractTemplateAction(templateId: string): Promise<
  | {
      success: true
      template: {
        id: string
        name: string
        servicePackageId: string | null
        documentTemplate: DocumentTemplate
      }
    }
  | { success: false; error: string }
> {
  const check = await verifyCompanyAdminForContractTemplates()
  if (!check.ok) return { success: false, error: check.error }

  try {
    const supabaseAdmin = createSupabaseAdmin()
    const record = await loadContractTemplateById(supabaseAdmin, check.companyId, templateId)
    if (!record) {
      return { success: false, error: 'Contract template not found' }
    }

    return {
      success: true,
      template: {
        id: record.id,
        name: record.name,
        servicePackageId: record.service_package_id,
        documentTemplate: record.template,
      },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load contract template'
    return { success: false, error: message }
  }
}

export async function ensureServicePackageContractTemplateAction(
  servicePackageId: string,
  packageName: string
): Promise<
  | { success: true; templateId: string }
  | { success: false; error: string }
> {
  const check = await verifyCompanyAdminForContractTemplates()
  if (!check.ok) return { success: false, error: check.error }

  try {
    const supabaseAdmin = createSupabaseAdmin()
    const record = await createServicePackageContractTemplate(
      supabaseAdmin,
      check.companyId,
      servicePackageId,
      packageName
    )
    revalidatePath('/dashboard/settings')
    return { success: true, templateId: record.id }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to create contract template'
    return { success: false, error: message }
  }
}

export async function updateContractTemplateAction(
  templateId: string,
  template: DocumentTemplate
): Promise<{ success: true } | { success: false; error: string }> {
  const check = await verifyCompanyAdminForContractTemplates()
  if (!check.ok) return { success: false, error: check.error }

  try {
    const supabaseAdmin = createSupabaseAdmin()
    await updateContractTemplateRecord(supabaseAdmin, check.companyId, templateId, {
      template: normalizeDocumentTemplate(template, 'contract'),
    })
    revalidatePath('/dashboard/settings')
    return { success: true }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save contract template'
    return { success: false, error: message }
  }
}

export async function resetContractTemplateAction(templateId: string): Promise<
  | { success: true; template: DocumentTemplate }
  | { success: false; error: string }
> {
  const check = await verifyCompanyAdminForContractTemplates()
  if (!check.ok) return { success: false, error: check.error }

  try {
    const supabaseAdmin = createSupabaseAdmin()
    const record = await resetContractTemplateRecord(
      supabaseAdmin,
      check.companyId,
      templateId
    )
    revalidatePath('/dashboard/settings')
    return { success: true, template: record.template }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to reset contract template'
    return { success: false, error: message }
  }
}

export async function deleteServicePackageContractTemplateAction(
  templateId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const check = await verifyCompanyAdminForContractTemplates()
  if (!check.ok) return { success: false, error: check.error }

  try {
    const supabaseAdmin = createSupabaseAdmin()
    await deleteServicePackageContractTemplate(supabaseAdmin, check.companyId, templateId)
    revalidatePath('/dashboard/settings')
    return { success: true }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to remove contract template override'
    return { success: false, error: message }
  }
}