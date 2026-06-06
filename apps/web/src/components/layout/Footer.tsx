import { Link } from 'react-router-dom'
import { Shield, Mail } from 'lucide-react'
import { motion } from 'framer-motion'

const TwitterIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
)

const GithubIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
)

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-bg-surface border-t border-border-base mt-auto transition-colors">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          
          {/* Brand */}
          <div className="col-span-1 space-y-5">
            <Link to="/" className="flex items-baseline gap-1 group w-fit">
              <span className="font-serif italic font-semibold text-text-primary text-2xl tracking-tight transition-colors group-hover:text-primary">BidSpace</span>
              <span className="font-serif italic text-primary text-sm font-bold" style={{ fontFamily: 'Amiri, serif' }}>مزاد</span>
            </Link>
            <p className="text-xs text-text-secondary leading-relaxed max-w-xs font-light tracking-wide">
              MENA's next-generation rare auction house sanctuary protected by custom machine learning fraud detection models.
            </p>
            <div className="flex items-center gap-2">
              {[
                { href: "https://twitter.com", icon: TwitterIcon, label: "Twitter" },
                { href: "https://github.com", icon: GithubIcon, label: "GitHub" },
                { href: "mailto:support@bidspace.com", icon: Mail, label: "Email" }
              ].map((social, i) => (
                <motion.a 
                  key={i}
                  whileHover={{ y: -1 }}
                  href={social.href} 
                  target="_blank" 
                  rel="noreferrer"
                  className="p-2.5 rounded-none border border-border-base bg-bg-tertiary/20 text-text-tertiary hover:border-text-secondary hover:text-text-primary transition-all duration-200"
                  aria-label={social.label}
                >
                  <social.icon className="w-3.5 h-3.5" />
                </motion.a>
              ))}
            </div>
          </div>

          {/* Marketplace Links */}
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-primary mb-6 font-sans">
              Marketplace
            </h3>
            <ul className="space-y-3 font-sans text-xs tracking-wider">
              <li>
                <Link to="/search" className="text-text-secondary hover:text-primary transition-colors uppercase font-medium text-[11px]">
                  All Collections
                </Link>
              </li>
              <li>
                <Link to="/search?category=watches" className="text-text-secondary hover:text-primary transition-colors uppercase font-medium text-[11px]">
                  Fine Watches
                </Link>
              </li>
              <li>
                <Link to="/search?category=cameras" className="text-text-secondary hover:text-primary transition-colors uppercase font-medium text-[11px]">
                  Vintage Cameras
                </Link>
              </li>
              <li>
                <Link to="/search?category=art" className="text-text-secondary hover:text-primary transition-colors uppercase font-medium text-[11px]">
                  Original Art
                </Link>
              </li>
            </ul>
          </div>

          {/* Platform Links */}
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-primary mb-6 font-sans">
              Platform
            </h3>
            <ul className="space-y-3 font-sans text-xs tracking-wider">
              <li>
                <Link to="/sell" className="text-text-secondary hover:text-primary transition-colors uppercase font-medium text-[11px]">
                  Consign Item
                </Link>
              </li>
              <li>
                <a href="/#how-it-works" className="text-text-secondary hover:text-primary transition-colors uppercase font-medium text-[11px]">
                  How it Works
                </a>
              </li>
              <li>
                <a href="/#provenance" className="text-text-secondary hover:text-primary transition-colors uppercase font-medium text-[11px]">
                  AI Provenance
                </a>
              </li>
              <li>
                <a href="/#provenance" className="text-text-secondary hover:text-primary transition-colors uppercase font-medium text-[11px]">
                  Trust & Safety
                </a>
              </li>
            </ul>
          </div>

          {/* Badges */}
          <div className="space-y-6">
            <div className="p-5 rounded-none bg-bg-tertiary/20 border border-border-base space-y-3">
              <div className="flex items-center gap-2 text-primary">
                <Shield className="w-3.5 h-3.5" />
                <span className="text-[9px] font-bold tracking-widest uppercase font-sans">AI Protected</span>
              </div>
              <p className="text-[11px] leading-relaxed text-text-tertiary font-light">
                Every bid is analyzed in real-time by our network models to block bot and fraudulent activity immediately.
              </p>
            </div>
            <div className="text-[9px] font-mono tracking-[0.15em] text-text-tertiary uppercase px-1">
              Secure Payments by <span className="text-text-secondary font-bold">Stripe</span>
            </div>
          </div>

        </div>

        {/* Bottom Area */}
        <div className="mt-16 pt-8 border-t border-border-base flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-[10px] font-mono tracking-wide text-text-tertiary uppercase">
            &copy; {currentYear} BidSpace Inc. All rights reserved.
          </p>
          <div className="flex items-center gap-6 font-mono text-[9px] tracking-widest uppercase">
            <Link to="/privacy" className="text-text-tertiary hover:text-text-secondary transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="text-text-tertiary hover:text-text-secondary transition-colors">Terms of Service</Link>
            <Link to="/cookies" className="text-text-tertiary hover:text-text-secondary transition-colors">Cookies</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
