/**
 * Landing page content — edit paths in `public/landing/` to swap visuals.
 *
 * Background photos: set `LANDING_BACKGROUND_PHOTOS_ENABLED` to true and update
 * `LANDING_SLIDESHOW_SLIDES[].src` (full-bleed JPGs in `public/landing/`).
 * Product screenshots use `productImage` / feature `image.src` separately.
 * Mobile product tour uses optional `mobileImage` per chapter (portrait PNGs in `public/landing/`).
 */

export const SERVICE_PORTAL_VERSION = '0.0.45'

export type LandingProductScreenshot = {
  src: string
  alt: string
  /** Intrinsic pixel width (desktop default 2000, mobile default 1170). */
  width?: number
  /** Intrinsic pixel height (desktop default 1200, mobile default 2532). */
  height?: number
}

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
  image: LandingProductScreenshot
  /** Portrait mobile screenshot for the product tour (`lg` hidden). Falls back to `image`. */
  mobileImage?: LandingProductScreenshot
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
  eyebrowBeta: 'Now in Beta',
  eyebrowRelease: 'Built for field service teams',
  headline: ['Your service business.', 'One management system.'],
  subheadline:
    'Run your entire small business with one solution, built for effective client interaction that makes you money.',
}

export const LANDING_MARQUEE_ITEMS = [
  'Landscaping',
  'Cleaning',
  'HVAC',
  'Plumbing',
  'Pest control',
  'Pool service',
  'Handy Work',
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
    title: 'Simple Yet Powerful Client & Customer Scheduling',
    description:
      'Drag jobs on a visual week view, assign crews, and let recurring work populate automatically when visits complete.',
    bullets: [
      'Interactive calendar with drag-to-reschedule',
      'Crew conflict detection and solo-business mode',
      'Business-hours timeline that matches how you operate',
    ],
    image: {
      src: '/landing/product-schedule.png',
      alt: 'ServicePortal schedule week view',
    },
    mobileImage: {
      src: '/landing/product-schedule-mobile.png',
      alt: 'ServicePortal schedule on mobile',
    },
    imagePosition: 'right',
  },
  {
    id: 'clients',
    eyebrow: 'Clients & Jobs',
    title: 'Client Management that Gives You Everything You Need',
    description:
      'Every client gets a full workspace — jobs, estimates, billing, files, photos, and messaging in one place.',
    bullets: [
      'Inline client editing with structured addresses',
      'Estimates with PDF export and convert-to-job flow',
      'Job photos with categories and storage limits by plan',
      'Document folders and branded invoice templates',
    ],
    image: {
      src: '/landing/product-clients.png',
      alt: 'ServicePortal client job workspace',
    },
    mobileImage: {
      src: '/landing/product-clients-mobile.png',
      alt: 'ServicePortal clients on mobile',
    },
    imagePosition: 'left',
  },
  {
    id: 'portal',
    eyebrow: 'Client portal',
    title: 'Interact with Your Customers Using Powerful Features',
    description:
      'Give clients a branded login to view jobs, approve estimates, pay invoices, and message your team.',
    bullets: [
      'Secure portal access per client',
      'Online invoice and estimate payments via Stripe',
      'Job history, documents, and photo galleries',
      'Two-way messaging with your office',
    ],
    image: {
      src: '/landing/product-portal-2.png',
      alt: 'ServicePortal client-facing portal',
    },
    mobileImage: {
      src: '/landing/product-portal-mobile.png',
      alt: 'ServicePortal client portal on mobile',
    },
    imagePosition: 'right',
  },
  {
    id: 'billing',
    eyebrow: 'Billing',
    title: 'Full Billing System for Invoices, Payments, and Advanced Reports',
    description:
      'Bill from jobs, collect through Stripe Connect, and track outstanding payments from a single payments hub.',
    bullets: [
      'Job-level billing and invoice PDF generation',
      'Stripe Connect for client payments',
      'Payments dashboard and in-depth reporting',
      'Reports for revenue and outstanding balances',
    ],
    image: {
      src: '/landing/product-billing.png',
      alt: 'ServicePortal billing and payments',
    },
    mobileImage: {
      src: '/landing/product-billing-mobile.png',
      alt: 'ServicePortal billing on mobile',
    },
    imagePosition: 'left',
  },
  {
    id: 'field',
    eyebrow: 'Field operations',
    title: 'Crew Coordination Built to Scale with Your Company',
    description:
      'Plan driving routes from your business location, give crews a focused day view, and keep field work moving.',
    bullets: [
      'Route planner with map visualization (Pro Tier Only)',
      'Team member “My Day” schedule view',
      'Job status automation — scheduled, in progress, archived',
      'Public booking page and lead capture pipeline',
    ],
    image: {
      src: '/landing/product-routes.png',
      alt: 'ServicePortal route planner map',
    },
    mobileImage: {
      src: '/landing/product-routes-mobile.png',
      alt: 'ServicePortal routes on mobile',
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
    mobileImage: {
      src: '/landing/product-integrations-mobile.png',
      alt: 'ServicePortal integrations on mobile',
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
