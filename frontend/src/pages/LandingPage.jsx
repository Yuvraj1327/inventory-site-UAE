import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import alRiggaLogo from "@/assets/al-rigga-icon.png";
import {
  ArrowRight, MagnifyingGlass, Package, Receipt, ChartLineUp, ShieldCheck,
  Handshake, Clock, GlobeHemisphereEast, EnvelopeSimple, Phone, List, X, CheckCircle,
} from "@phosphor-icons/react";

// Public marketing site, shown before authentication. Entirely separate
// from the ERP: no API calls, no customer/admin data — everything here is
// static company content plus links into the existing /login flow.
const NAV_LINKS = [
  { label: "About", href: "#about" },
  { label: "Products / Brands", href: "#brands" },
  { label: "Services", href: "#services" },
  { label: "Why Al Rigga Auto", href: "#why" },
  { label: "Contact", href: "#contact" },
];

const BRANDS = [
  { name: "Nissan", src: "/images/nissan.jpg" },
  { name: "Infiniti", src: "/images/infiniti.jpg" },
  { name: "Toyota", src: "/images/toyota.jpg" },
  { name: "Lexus", src: "/images/lexus.jpg" },
  { name: "Renault", src: "/images/renault.jpg" },
  { name: "Mercedes-Benz", src: "/images/mercedes-benz.jpg" },
  { name: "BMW", src: "/images/bmw.jpg" },
];

const WHY_ITEMS = [
  { icon: Clock, title: "10+ Years Industry Experience", text: "A decade-plus track record supplying the UAE automotive spare parts trade." },
  { icon: ShieldCheck, title: "Genuine Quality", text: "Parts sourced and stocked to a consistent quality standard, every order." },
  { icon: ChartLineUp, title: "Competitive Pricing", text: "Wholesale pricing structured for repeat, high-volume B2B buyers." },
  { icon: Handshake, title: "Reliable Supply Network", text: "An established supplier base built to keep stock moving without disruption." },
  { icon: Package, title: "Fast & Efficient Service", text: "Streamlined ordering and fulfilment built around how trade buyers actually work." },
  { icon: GlobeHemisphereEast, title: "UAE & Regional Market Reach", text: "Serving customers across the UAE and into regional markets." },
];

const PORTAL_FEATURES = [
  "Search parts by Part Number",
  "Check real-time availability",
  "View your own negotiated pricing",
  "Add parts to an order",
  "Track order status",
  "Access invoices & account information",
];

function Section({ id, className = "", children }) {
  return <section id={id} className={`py-16 sm:py-24 px-5 sm:px-8 ${className}`}>{children}</section>;
}

function Eyebrow({ children }) {
  return <div className="text-xs uppercase tracking-[0.2em] font-semibold text-primary mb-3">{children}</div>;
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="landing-page">
      {/* ---------- NAVBAR ---------- */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <a href="#top" className="flex items-center gap-2.5 shrink-0">
            <img src={alRiggaLogo} alt="Al Rigga Auto" className="h-9 w-auto object-contain" />
            <div className="leading-tight hidden sm:block">
              <div className="font-bold text-base tracking-tight" style={{ fontFamily: "Manrope" }}>Al Rigga Auto</div>
              <div className="text-[10px] text-muted-foreground">Auto Spare Parts</div>
            </div>
          </a>

          <nav className="hidden lg:flex items-center gap-7">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="text-sm text-foreground/75 hover:text-foreground transition-colors">{l.label}</a>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-2.5">
            <Button variant="outline" onClick={() => navigate("/login")} data-testid="nav-customer-login">Customer Login</Button>
            <Button onClick={() => window.location.href = "mailto:support@alriggaauto.com?subject=Business%20Account%20Request"} data-testid="nav-request-access">
              Request Access
            </Button>
          </div>

          <button className="lg:hidden h-9 w-9 flex items-center justify-center" onClick={() => setMobileOpen((v) => !v)} aria-label="Menu">
            {mobileOpen ? <X size={22} /> : <List size={22} />}
          </button>
        </div>

        {mobileOpen && (
          <div className="lg:hidden border-t border-border bg-background px-5 py-4 space-y-3">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setMobileOpen(false)} className="block text-sm text-foreground/80 py-1.5">{l.label}</a>
            ))}
            <div className="flex flex-col gap-2 pt-2">
              <Button variant="outline" onClick={() => navigate("/login")}>Customer Login</Button>
              <Button onClick={() => window.location.href = "mailto:support@alriggaauto.com?subject=Business%20Account%20Request"}>Request Access</Button>
            </div>
          </div>
        )}
      </header>

      {/* ---------- HERO ---------- */}
      {/* The supplied Dubai banner is the hero itself: full-bleed photograph
          with the copy overlaid in the left column, so the right 55–65% of
          the frame stays clear. Crop panning and the scrim direction are
          handled by .hero-banner-img / .hero-banner-scrim in index.css. */}
      <div id="top" />
      <section className="relative isolate overflow-hidden border-b border-border" data-testid="hero">
        <img
          src="/images/hero-banner.jpg"
          alt="Automotive spare parts — brake discs, filters, pads, batteries and belts — laid out in front of the Dubai skyline, alongside an Al Rigga Auto warehouse, the UAE flag and delivery vehicles"
          className="hero-banner-img absolute inset-0 h-full w-full object-cover"
          loading="eager"
          fetchPriority="high"
        />
        <div className="hero-banner-scrim absolute inset-0" aria-hidden="true" />

        <div className="relative max-w-7xl mx-auto px-5 sm:px-8 min-h-[540px] sm:min-h-[580px] lg:min-h-[640px] flex items-end lg:items-center py-14 sm:py-16 lg:py-20">
          <div className="w-full lg:w-[52%] xl:w-[48%]">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-primary-foreground bg-primary border border-primary rounded-full px-3 py-1 mb-6">
              Wholesale B2B Automotive Spare Parts Supplier
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.08] text-background" style={{ fontFamily: "Manrope" }}>
              Genuine automotive parts.<br /><span className="text-primary">Trusted supply</span>, at scale.
            </h1>
            <p className="mt-6 text-base sm:text-lg text-background/85 max-w-xl leading-relaxed">
              Al Rigga Auto supplies dependable spare parts to trade buyers across the UAE and regional markets — built on genuine quality, competitive pricing, and over a decade of supplier relationships.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" onClick={() => navigate("/login")} data-testid="hero-customer-login" className="gap-2 h-12 px-6 text-base">
                Customer Login <ArrowRight size={18} />
              </Button>
              <Button size="lg" variant="outline" onClick={() => window.location.href = "mailto:support@alriggaauto.com?subject=Business%20Account%20Request"}
                data-testid="hero-request-access"
                className="h-12 px-6 text-base bg-background/10 border-background/40 text-background hover:bg-background hover:text-foreground">
                Request Business Access
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Portal capability strip — the same four items that previously sat in
          the hero's side panel, moved directly below so the banner reads as
          one uninterrupted image. */}
      <div className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-8 sm:py-10">
          <div className="text-xs uppercase tracking-[0.14em] font-semibold text-muted-foreground mb-5">Live on the Customer Portal</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Part Number Search", icon: MagnifyingGlass },
              { label: "Customer-Specific Pricing", icon: ChartLineUp },
              { label: "Order Tracking", icon: Package },
              { label: "Invoices & Statements", icon: Receipt },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background">
                <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0"><f.icon size={17} weight="duotone" /></div>
                <span className="text-sm font-medium">{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---------- ABOUT ---------- */}
      <Section id="about" className="bg-card border-y border-border">
        <div className="max-w-5xl mx-auto">
          <Eyebrow>About Al Rigga Auto</Eyebrow>
          <h2 className="text-3xl font-bold tracking-tight mb-10" style={{ fontFamily: "Manrope" }}>
            Welcome to Al Rigga Auto Spare Parts Trading Company
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="p-6 shadow-card">
              <p className="text-sm leading-relaxed text-muted-foreground">
                With more than a decade of industry experience, Al Rigga Auto Spare Parts Trading Company has established itself as a trusted and respected name in the automotive spare parts industry across the UAE and regional markets.
              </p>
            </Card>
            <Card className="p-6 shadow-card">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Operating in a highly competitive and dynamic marketplace, we have built strong and enduring relationships with customers and suppliers through our commitment to genuine quality, competitive pricing, reliability, integrity, and exceptional service.
              </p>
            </Card>
            <Card className="p-6 shadow-card">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Over the years, Al Rigga Auto has continued to strengthen its market presence by expanding its product portfolio, developing a reliable supply network, and adapting to the evolving needs of the automotive industry.
              </p>
            </Card>
            <Card className="p-6 shadow-card">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Today, we remain committed to delivering dependable automotive spare parts solutions while continuously expanding our capabilities to serve our customers with greater efficiency, value, and confidence.
              </p>
            </Card>
          </div>
        </div>
      </Section>

      {/* ---------- BRANDS ---------- */}
      <Section id="brands">
        <div className="max-w-6xl mx-auto text-center">
          <Eyebrow>Product Range</Eyebrow>
          <h2 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "Manrope" }}>Brands We Supply</h2>
          <p className="text-sm text-muted-foreground mt-3 max-w-2xl mx-auto">
            Spare parts sourced to cover a wide range of makes. Brand names and logos are shown to indicate vehicle compatibility only — Al Rigga Auto is an independent spare-parts supplier, not an authorized dealer or representative of these manufacturers.
          </p>
          <div className="mt-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {BRANDS.map((b) => (
              <Card key={b.name} className="p-6 shadow-card flex items-center justify-center h-28 hover:border-primary/30 transition-colors">
                <img src={b.src} alt={`${b.name} compatible parts`} className="max-h-14 max-w-[85%] object-contain" />
              </Card>
            ))}
          </div>
        </div>
      </Section>

      {/* ---------- WHY AL RIGGA AUTO ---------- */}
      <Section id="why" className="bg-card border-y border-border">
        <div className="max-w-6xl mx-auto">
          <Eyebrow>Why Al Rigga Auto</Eyebrow>
          <h2 className="text-3xl font-bold tracking-tight mb-10" style={{ fontFamily: "Manrope" }}>Built for trade buyers who need to rely on their supplier</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {WHY_ITEMS.map((w) => (
              <Card key={w.title} className="p-5 shadow-card">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4"><w.icon size={19} weight="duotone" /></div>
                <h3 className="font-bold text-base" style={{ fontFamily: "Manrope" }}>{w.title}</h3>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{w.text}</p>
              </Card>
            ))}
          </div>
        </div>
      </Section>

      {/* ---------- CUSTOMER PORTAL ---------- */}
      <Section id="services">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <Eyebrow>B2B Customer Portal</Eyebrow>
            <h2 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "Manrope" }}>Search. Order. Manage.</h2>
            <p className="text-sm text-muted-foreground mt-4 leading-relaxed max-w-md">
              Registered customers place and manage orders directly through our digital ordering platform — built specifically for how a spare-parts trade account actually operates.
            </p>
            <Button className="mt-7 gap-2 h-11 px-5" onClick={() => navigate("/login")} data-testid="portal-cta-login">
              Login to Customer Portal <ArrowRight size={16} />
            </Button>
          </div>
          <Card className="p-6 shadow-card">
            <div className="space-y-2.5">
              {PORTAL_FEATURES.map((f) => (
                <div key={f} className="flex items-center gap-2.5 text-sm">
                  <CheckCircle size={16} weight="fill" className="text-primary shrink-0" />
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </Section>

      {/* ---------- FINAL CTA ---------- */}
      <Section className="bg-foreground text-background">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "Manrope" }}>
            Looking for reliable automotive spare parts supply?
          </h2>
          <p className="text-background/70 text-sm mt-3">Get in touch to discuss a trade account, or contact us with any question.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" className="h-12 px-6 text-base" onClick={() => window.location.href = "mailto:support@alriggaauto.com?subject=Business%20Account%20Request"} data-testid="final-cta-request">
              Request Business Access
            </Button>
            <Button size="lg" variant="outline" className="h-12 px-6 text-base bg-transparent border-background/30 text-background hover:bg-background/10 hover:text-background"
              onClick={() => document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" })} data-testid="final-cta-contact">
              Contact Us
            </Button>
          </div>
        </div>
      </Section>

      {/* ---------- FOOTER / CONTACT ---------- */}
      <footer id="contact" className="border-t border-border px-5 sm:px-8 py-12">
        <div className="max-w-7xl mx-auto grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <img src={alRiggaLogo} alt="Al Rigga Auto" className="h-8 w-auto object-contain" />
              <span className="font-bold text-base" style={{ fontFamily: "Manrope" }}>Al Rigga Auto</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">Al Rigga Auto Spare Parts Trading Company — automotive spare parts supply across the UAE and regional markets.</p>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide mb-3">Quick Links</div>
            <div className="space-y-2">
              {NAV_LINKS.map((l) => <a key={l.href} href={l.href} className="block text-sm text-muted-foreground hover:text-foreground transition-colors">{l.label}</a>)}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide mb-3">Contact</div>
            <div className="space-y-2.5">
              <a href="mailto:support@alriggaauto.com" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <EnvelopeSimple size={15} /> support@alriggaauto.com
              </a>
              <a href="tel:+97140000000" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <Phone size={15} /> +971 4 000 0000
              </a>
              <p className="text-sm text-muted-foreground">United Arab Emirates</p>
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide mb-3">Account</div>
            <Button variant="outline" size="sm" onClick={() => navigate("/login")} data-testid="footer-customer-login">Customer Login</Button>
          </div>
        </div>
        <div className="max-w-7xl mx-auto border-t border-border mt-10 pt-6 text-xs text-muted-foreground">
          © {new Date().getFullYear()} Al Rigga Auto Spare Parts Trading Company. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
