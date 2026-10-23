/**
 * Full-screen marketing landing (static HTML with Three.js / GSAP).
 * Launch Kavach navigates to /dashboard in the parent SPA.
 */
export default function Landing() {
  const src = `${import.meta.env.BASE_URL}landing.html`.replace(/\/{2,}/g, '/')

  return (
    <iframe
      title="Netrika Kavach-Trace"
      src={src}
      className="fixed inset-0 z-[100] h-[100dvh] w-full border-0 bg-[#1c1f24]"
    />
  )
}
