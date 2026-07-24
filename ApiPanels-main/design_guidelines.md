# Norch REST API Panel - Design Guidelines

## Design Approach

**System-Based with Developer Tool References**
Drawing inspiration from modern API testing platforms (Postman, Insomnia) and contemporary developer tools (Linear, Vercel Dashboard), creating a vibrant yet professional testing environment.

## Core Design Principles

1. **Developer-Friendly Clarity**: Instant visual hierarchy between navigation, inputs, and outputs
2. **Vibrant Professionalism**: Eye-catching purple/pink gradient accent system with dark theme foundation
3. **Interactive Immediacy**: Zero friction between reading docs and testing endpoints
4. **Media-First Responses**: Prioritize visual display of images/videos over raw URLs

---

## Typography

**Font Stack**: Inter (primary), JetBrains Mono (code blocks)

**Hierarchy**:
- Page Title/Dashboard: text-3xl font-bold
- Category Headers: text-xl font-semibold 
- API Endpoint Names: text-lg font-medium
- Parameter Labels: text-sm font-medium
- Body/Descriptions: text-base
- Code Snippets: text-sm font-mono
- Helper Text: text-xs text-gray-400

---

## Layout System

**Spacing Primitives**: Use Tailwind units of 3, 4, 6, 8, 12

**Dashboard Structure**:
- Sidebar: Fixed width 280px (w-70), collapsible categories with smooth transitions
- Main Content: Flexible with max-w-6xl container, responsive padding (px-6 lg:px-12)
- Test Panel: Two-column layout (lg:grid-cols-2) - inputs left, response right
- Card spacing: gap-6 between cards, p-6 internal padding

**Responsive Breakpoints**:
- Mobile: Single column, slide-out sidebar
- Tablet (md:): Persistent sidebar, stacked test panels
- Desktop (lg:): Full two-column test interface

---

## Component Library

### Navigation Sidebar
- Dark background with subtle gradient overlay
- Collapsible category sections (AI, Search, Downloader) with chevron icons
- Active endpoint: purple/pink gradient highlight with rounded corners
- Hover state: Slight brightness increase with smooth transition
- Logo/branding at top with "Norch REST API" title

### API Endpoint Cards (List View)
- Card layout with subtle border and hover elevation
- Badge indicating category (AI/Search/Downloader) with gradient backgrounds
- Endpoint path displayed in monospace font
- Quick description and parameter count preview
- Click to expand full test panel

### Interactive Test Panel
**Left Column - Input Section**:
- Dynamic form fields based on API parameters
- Each input: Label with required indicator, placeholder with example value
- Input styling: Dark background, purple/pink focus ring, rounded borders
- "Execute" button: Large, gradient (purple to pink), with loading spinner state
- Parameter helper text below each input

**Right Column - Response Section**:
- Tabbed interface: "Response", "Headers", "Code Example"
- JSON Response: Syntax-highlighted with collapsible nested objects
- Media Display: For image/video URLs, render actual preview with download button
- Status indicator: Green checkmark for 200, red for errors
- Response time badge in top corner
- Copy-to-clipboard button for JSON

### Code Example Generator
- Pre-formatted code blocks showing fetch/axios usage
- Language tabs: JavaScript, cURL, Python
- Dark theme syntax highlighting with line numbers
- One-click copy functionality

### Stats Dashboard (Optional Overview Page)
- Grid of stat cards showing: Total Endpoints, Avg Response Time, Uptime
- Recent test history with timestamps
- Quick access buttons to each category

### Response Media Viewer
- Image responses: Full-width preview with zoom capability, alt text showing filename
- Video responses: Embedded player with controls, download option
- Fallback for failed loads with error message

---

## Color Palette (Gradient Accent System)

**Foundation**:
- Background: Slate-900/950 (#0f172a, #020617)
- Cards: Slate-800 with subtle transparency
- Borders: Slate-700

**Accent Gradients**:
- Primary: Purple (#8b5cf6) → Pink (#ec4899)
- Apply to: Execute buttons, active states, category badges
- Hover states: Increase brightness by 10%

**Text**:
- Primary: White (#ffffff)
- Secondary: Slate-300 (#cbd5e1)
- Muted: Slate-400 (#94a3b8)

**Status Colors**:
- Success: Emerald-500 (#10b981)
- Error: Red-500 (#ef4444)
- Warning: Amber-500 (#f59e0b)

---

## Animations

Use sparingly for functional feedback:
- Sidebar collapse/expand: 200ms ease transition
- Card hover: Gentle lift with shadow (translate-y-[-2px])
- Button loading: Spinning gradient border
- Response loading: Skeleton screen with shimmer effect
- Success states: Subtle scale bounce (scale-105 → scale-100)

---

## Accessibility & Interactions

- Keyboard navigation: Tab through inputs, Enter to execute
- Focus indicators: 2px purple ring on all interactive elements
- Loading states: Disable inputs during API call with visual feedback
- Error messages: Red text below failed inputs with icon
- Success confirmations: Toast notification in top-right corner

---

## Special Features

**Author Credit Display**: Every JSON response includes `"author": "April Manalo"` - highlight this field with subtle gradient background in response viewer

**Media Intelligence**: Detect image/video URLs in response and auto-render preview panels rather than showing raw URL strings

**Quick Test**: Pre-fill example values in inputs for one-click testing

**Response History**: Cache last 5 responses per endpoint for quick reference

---

This design creates a professional yet visually striking API testing environment that balances developer needs with the vibrant aesthetic requested, ensuring Norch REST API stands out while remaining highly functional.