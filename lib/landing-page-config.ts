/**
 * Landing page content — edit paths in `public/landing/` to swap visuals.
 *
 * Background photos: set `LANDING_BACKGROUND_PHOTOS_ENABLED` to true and update
 * `LANDING_SLIDESHOW_SLIDES[].src` (full-bleed JPGs in `public/landing/`).
 * Product screenshots use `productImage` / feature `image.src` separately.
 */

export const SERVICE_PORTAL_VERSION = '0.0.27'

/** Full-bleed photo slideshow behind hero (and upper scroll). Product tour stays on solid paper. */
export const LANDING_BACKGROUND_PHOTOS_ENABLED = true

export type LandingSlide = {
  src: string
  alt: string
  caption: string
  label: string
  productImage: { src: string; alt: string }
}

export type LandingBentoFeature = {
  id: string
  title: string
  description: string
  span: 'default' | 'wide' | 'tall'
}

export type LandingFeatureSection = {
  id: string
  eyebrow: string
  title: string
  description: string
  bullets: string[]
  image: {
    src: string
    alt: string
  }
  imagePosition: 'left' | 'right'
}

export const LANDING_SLIDESHOW_SLIDES: LandingSlide[] = [
  {
    src: '/landing/slide-1-product.png',
    alt: 'Field crew coordinating jobs on site',
    label: 'Schedule',
    caption: 'Drag-and-drop week calendar with crew colors and recurring visits.',
    productImage: {
      src: '/landing/product-schedule.png',
      alt: 'ServicePortal schedule dashboard',
    },
  },

]

export const LANDING_HERO = {
  eyebrow: 'Now in Beta',
  headline: ['Your service business.', 'One operating system.'],
  subheadline:
    'Schedule crews, bill clients, and run a branded portal — built for landscaping, cleaning, HVAC, and every appointment-based trade.',
}

export const LANDING_MARQUEE_ITEMS = [
  'Landscaping',
  'Cleaning',
  'HVAC',
  'Plumbing',
  'Pest control',
  'Pool service',
  'Property maintenance',
  'Electrical',
]

export const LANDING_METRICS = [
  { value: '14-day', label: 'Free trial' },
  { value: '1 portal', label: 'Ops + billing + clients' },
  { value: 'Stripe', label: 'Payments built in' },
  { value: 'Pro', label: 'Routes & integrations' },
]

export const LANDING_FEATURE_SECTIONS: LandingFeatureSection[] = [
  {
    id: 'schedule',
    eyebrow: 'Scheduling',
    title: 'Week calendar, crews, and recurring visits',
    description:
      'Drag jobs on a visual week view, assign crews, and let recurring work spawn automatically when visits complete.',
    bullets: [
      'Interactive week calendar with drag-to-reschedule',
      'Crew conflict detection and solo-business mode',
      'Recurring rules for daily, weekly, and monthly jobs',
      'Business-hours timeline that matches how you operate',
    ],
    image: {
      src: '/landing/product-schedule.png',
      alt: 'ServicePortal schedule week view',
    },
    imagePosition: 'right',
  },
  {
    id: 'clients',
    eyebrow: 'Clients & jobs',
    title: 'CRM, estimates, documents, and job photos',
    description:
      'Every client gets a full workspace — jobs, estimates, billing, files, photos, and messaging in one place.',
    bullets: [
      'Inline client editing with structured addresses',
      'Estimates with PDF export and convert-to-job flow',
      'Job photos with categories and storage limits by plan',
      'Document folders and branded invoice templates',
    ],
    image: {
      src: '/landing/product-portal.png',
      alt: 'ServicePortal client job workspace',
    },
    imagePosition: 'left',
  },
  {
    id: 'portal',
    eyebrow: 'Client portal',
    title: 'A portal your customers will actually use',
    description:
      'Give clients a branded login to view jobs, approve estimates, pay invoices, and message your team.',
    bullets: [
      'Secure portal access per client',
      'Online invoice and estimate payments via Stripe',
      'Job history, documents, and photo galleries',
      'Two-way messaging with your office',
    ],
    image: {
      src: '/landing/product-portal.png',
      alt: 'ServicePortal client-facing portal',
    },
    imagePosition: 'right',
  },
  {
    id: 'billing',
    eyebrow: 'Billing',
    title: 'Invoices, payments, and AR without spreadsheets',
    description:
      'Bill from jobs, collect through Stripe Connect, and track what is outstanding from a single payments hub.',
    bullets: [
      'Job-level billing and invoice PDF generation',
      'Stripe Connect for client payments',
      'Payments dashboard and AR aging visibility',
      'Reports for revenue and outstanding balances',
    ],
    image: {
      src: '/landing/product-portal.png',
      alt: 'ServicePortal billing and payments',
    },
    imagePosition: 'left',
  },
  {
    id: 'field',
    eyebrow: 'Field operations',
    title: 'Routes, team day view, and live coordination',
    description:
      'Plan driving routes from your depot, give crews a focused day view, and keep field work moving.',
    bullets: [
      'Route planner with map visualization (Pro)',
      'Team member “My Day” schedule view',
      'Job status automation — scheduled, in progress, archived',
      'Public booking page and lead capture pipeline',
    ],
    image: {
      src: '/landing/product-routes.png',
      alt: 'ServicePortal route planner map',
    },
    imagePosition: 'right',
  },
  {
    id: 'integrations',
    eyebrow: 'Integrations',
    title: 'Connect QuickBooks, Google Calendar, and more',
    description:
      'Pro teams can sync accounting and calendars, trigger Zapier automations, and keep the back office in sync.',
    bullets: [
      'QuickBooks Online sync (Pro)',
      'Google Calendar OAuth integration (Pro)',
      'Zapier event hooks for jobs and clients',
      'Email and SMS notification reminders',
    ],
    image: {
      src: '/landing/product-schedule.png',
      alt: 'ServicePortal integrations settings',
    },
    imagePosition: 'left',
  },
]

export const LANDING_BENTO_FEATURES: LandingBentoFeature[] = [
  {
    id: 'schedule',
    title: 'Week calendar',
    description: 'Drag jobs, detect crew conflicts, and project recurring visits.',
    span: 'wide',
  },
  {
    id: 'portal',
    title: 'Client portal',
    description: 'Branded login for jobs, estimates, photos, and messaging.',
    span: 'default',
  },
  {
    id: 'billing',
    title: 'Billing & Stripe',
    description: 'Invoices, job billing, online pay, and AR aging.',
    span: 'default',
  },
  {
    id: 'routes',
    title: 'Route planner',
    description: 'Driving routes from depot to jobs on an interactive map.',
    span: 'tall',
  },
  {
    id: 'leads',
    title: 'Leads & booking',
    description: 'Capture leads and accept bookings from a public page.',
    span: 'default',
  },
  {
    id: 'integrations',
    title: 'Integrations',
    description: 'QuickBooks, Google Calendar, and Zapier on Pro.',
    span: 'wide',
  },
]

export const LANDING_CLOSING = {
  headline: 'Stop juggling tools.',
  subheadline: 'Start your free trial and run your next job in ServicePortal today.',
}

export const LANDING_SLIDESHOW_INTERVAL_MS = 6000
