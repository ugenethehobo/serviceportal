'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { ContractPdfError } from '@/lib/contract-pdf-source'
import { isContractStarterId } from '@/lib/contract-template-library'
import {
  assignServicePackageContractTemplate,
  ContractTemplateError,
  createContractTemplateFromPdf,
  createContractTemplateFromStarter,
  deleteContractTemplate,
  duplicateContractTemplate,
  loadContractTemplateById,
  loadContractTemplatesPageData,
  replaceContractTemplatePdf,
  setDefaultContractTemplate,
  updateContractTemplateRecord,
} from '@/lib/contract-templates-server'
import type { ContractTemplatesPageData } from '@/lib/contract-templates'
import type { DocumentTemplate } from '@/lib/document-template'
import {
  getSessionProfile,
  isStaffRole,
  TRIAL_EXPIRED_ERROR,
  verifyStaffSubscriptionAccess,
} from '@/lib/portal-auth'

type ActionResult<T = object> = ({ success: true } & T) | { success: false; error: string }

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function verifyCompanyAdminForContractTemplates() {
  const session = await getSessionProfile()
  if (!session) return { ok: false as const, error: 'Not authenticated' }
  if (!session.profile.company_id) {
    return { ok: false as const, error: 'No company associated with this account' }
  }
  if (!isStaffRole(session.profile.role)) return { ok: false as const, error: 'Unauthorized' }

  const subscription = await verifyStaffSubscriptionAccess(session.profile.company_id)
  if (!subscription.ok) return { ok: false as const, error: TRIAL_EXPIRED_ERROR }

  if (session.profile.role !== 'company_admin') {
    return { ok: false as const, error: 'Only company admins can manage contract templates' }
  }

  return { ok: true as const, companyId: session.profile.company_id }
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ContractTemplateError || error instanceof ContractPdfError) {
    return error.message
  }
  const message = error instanceof Error ? error.message : fallback
  if (message.includes('42P01')) {
    return 'Contracts are not enabled yet. Run supabase/contracts-schema.sql.'
  }
  return message || fallback
}

async function runAdmin<T extends object>(
  fallbackError: string,
  run: (companyId: string, supabaseAdmin: ReturnType<typeof createSupabaseAdmin>) => Promise<T>
): Promise<ActionResult<T>> {
  const check = await verifyCompanyAdminForContractTemplates()
  if (!check.ok) return { success: false, error: check.error }
  try {
    const result = await run(check.companyId, createSupabaseAdmin())
    return { success: true, ...result }
  } catch (error: unknown) {
    return { success: false, error: errorMessage(error, fallbackError) }
  }
}

async function readPdfUpload(formData: FormData) {
  const file = formData.get('file')
  if (!file || typeof file !== 'object' || !('arrayBuffer' in file) || (file as File).size === 0) {
    throw new ContractTemplateError('Choose a PDF to upload')
  }
  const pdf = file as File
  if (pdf.type && pdf.type !== 'application/pdf') {
    throw new ContractTemplateError('Upload a PDF file')
  }
  return { bytes: new Uint8Array(await pdf.arrayBuffer()), fileName: pdf.name || 'contract.pdf' }
}

export async function getContractTemplatesPageDataAction(): Promise<
  ActionResult<{ data: ContractTemplatesPageData }>
> {
  return runAdmin('Failed to load contract templates', async (companyId, admin) => ({
    data: await loadContractTemplatesPageData(admin, companyId),
  }))
}

export async function getContractTemplateAction(templateId: string): Promise<
  ActionResult<{
    template: {
      id: string
      name: string
      description: string | null
      isPdfBased: boolean
      documentTemplate: DocumentTemplate
    }
  }>
> {
  return runAdmin('Failed to load contract template', async (companyId, admin) => {
    const record = await loadContractTemplateById(admin, companyId, templateId)
    if (!record) throw new ContractTemplateError('Contract template not found')
    return {
      template: {
        id: record.id,
        name: record.name,
        description: record.description,
        isPdfBased: record.source_type === 'pdf',
        documentTemplate: record.template,
      },
    }
  })
}

export async function createContractTemplateFromStarterAction(
  starterId: string,
  name?: string
): Promise<ActionResult<{ templateId: string }>> {
  return runAdmin('Failed to create contract template', async (companyId, admin) => {
    if (!isContractStarterId(starterId)) throw new ContractTemplateError('Unknown starter template')
    const record = await createContractTemplateFromStarter(admin, companyId, { starterId, name })
    revalidatePath('/dashboard/settings')
    return { templateId: record.id }
  })
}

/** FormData fields: file (PDF), name? */
export async function createContractTemplateFromPdfAction(
  formData: FormData
): Promise<ActionResult<{ templateId: string }>> {
  return runAdmin('Failed to upload contract PDF', async (companyId, admin) => {
    const upload = await readPdfUpload(formData)
    const record = await createContractTemplateFromPdf(admin, companyId, {
      ...upload,
      name: String(formData.get('name') || '') || null,
    })
    revalidatePath('/dashboard/settings')
    return { templateId: record.id }
  })
}

/** FormData fields: file (PDF). Keeps placed fields on the pages that still exist. */
export async function replaceContractTemplatePdfAction(
  templateId: string,
  formData: FormData
): Promise<ActionResult<{ template: DocumentTemplate }>> {
  return runAdmin('Failed to replace contract PDF', async (companyId, admin) => {
    const upload = await readPdfUpload(formData)
    const record = await replaceContractTemplatePdf(admin, companyId, templateId, upload)
    revalidatePath('/dashboard/settings')
    return { template: record.template }
  })
}

export async function updateContractTemplateAction(
  templateId: string,
  template: DocumentTemplate
): Promise<ActionResult> {
  return runAdmin('Failed to save contract template', async (companyId, admin) => {
    await updateContractTemplateRecord(admin, companyId, templateId, { template })
    return {}
  })
}

export async function updateContractTemplateDetailsAction(
  templateId: string,
  details: { name?: string; description?: string | null }
): Promise<ActionResult> {
  return runAdmin('Failed to save contract template', async (companyId, admin) => {
    await updateContractTemplateRecord(admin, companyId, templateId, details)
    revalidatePath('/dashboard/settings')
    return {}
  })
}

export async function duplicateContractTemplateAction(
  templateId: string
): Promise<ActionResult<{ templateId: string }>> {
  return runAdmin('Failed to duplicate contract template', async (companyId, admin) => {
    const record = await duplicateContractTemplate(admin, companyId, templateId)
    revalidatePath('/dashboard/settings')
    return { templateId: record.id }
  })
}

export async function deleteContractTemplateAction(templateId: string): Promise<ActionResult> {
  return runAdmin('Failed to delete contract template', async (companyId, admin) => {
    await deleteContractTemplate(admin, companyId, templateId)
    revalidatePath('/dashboard/settings')
    return {}
  })
}

export async function setDefaultContractTemplateAction(templateId: string): Promise<ActionResult> {
  return runAdmin('Failed to set default template', async (companyId, admin) => {
    await setDefaultContractTemplate(admin, companyId, templateId)
    revalidatePath('/dashboard/settings')
    return {}
  })
}

export async function assignServicePackageContractTemplateAction(
  servicePackageId: string,
  templateId: string | null
): Promise<ActionResult> {
  return runAdmin('Failed to update service package', async (companyId, admin) => {
    await assignServicePackageContractTemplate(admin, companyId, servicePackageId, templateId)
    revalidatePath('/dashboard/settings')
    return {}
  })
}
