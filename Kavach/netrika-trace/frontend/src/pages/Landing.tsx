import { useEffect } from 'react'
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import Aurora from '../components/ui/Aurora'
import Hero from '../components/landing/Hero'
import InterceptDemo from '../components/landing/InterceptDemo'
import LiveFeed from '../components/landing/LiveFeed'
import PipelineStory from '../components/landing/PipelineStory'
import { Cast, Counters, Deploy, FinalCta, Footer, Marquee, Navbar, Problem, SectionHead, Reveal } from '../components/landing/Sections'

function Demo() {
  return (
    <section id="demo" className="mx-auto max-w-6xl px-6 py-20">
      <SectionHead eyebrow="See it live" title="Watch a leak get caught" sub="This is the real interface, running on sample traffic. The left side is a request being inspected, the right side is your incidents list." center />
      <div className="mt-12 grid items-start gap-6 lg:grid-cols-2">
        <Reveal><InterceptDemo /></Reveal>
        <Reveal delay={0.1}><LiveFeed /></Reveal>
      </div>
    </section>
  )
}

export default function Landing() {
  const reduce = useReducedMotion()
  const { scrollY } = useScroll()
  const y1 = useTransform(scrollY, [0, 1500], [0, -220])

  useEffect(() => {
    const prev = document.title
    document.title = 'Netrika Trace | Guardian of your AI border'
    return () => {
      document.title = prev
    }
  }, [])

  return (
    <div className="relative min-h-screen overflow-x-clip bg-bg text-fg">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 h-[100dvh]">
        <motion.div className="absolute inset-0" style={{ y: reduce ? 0 : y1 }}>
          <Aurora tone="mix" strong />
        </motion.div>
      </div>

      <div className="relative z-10">
        <Navbar />
        <main>
          <Hero />
          <Marquee />
          <Counters />
          <Problem />
          <Cast />
          <PipelineStory />
          <Demo />
          <Deploy />
          <FinalCta />
        </main>
        <Footer />
      </div>
    </div>
  )
}
