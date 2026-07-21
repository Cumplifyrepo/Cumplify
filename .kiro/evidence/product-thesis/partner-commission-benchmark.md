# EVIDENCE — SaaS Partner-Commission Benchmark (web research, 2026-07-21)

> Owner order: "25% commission will lead us broke!!! 10% is the most we can
> pay, benchmark with real affiliate programs online and cite the sources."
> Grounds §9.4 of architecture.md. Verdict up front: **the market evidence
> supports the owner's 10% ceiling**; the v7 design's LIFETIME tail was the
> genuinely dangerous element.

## 1a. Horizontal SaaS programs (named, sourced)
| Program | Commission | Type | Duration | Source |
|---|---|---|---|---|
| HubSpot Affiliate | 30% | recurring | **capped 12 mo** | hubspot.com/partners/affiliates |
| HubSpot Solutions Partner | 20% of MRR | rev-share (resell) | up to 3 yrs | hubspot.com/solutions-partners-tiers-and-benefits-2026 |
| Shopify | 20% or ~$150 bounty | recurring / one-time | while active | uppromote.com/blog/shopify-affiliate-commission-rates/ |
| Stripe Partner | **no published %** (non-cash) | — | — | stripe.com/blog/stripe-partner-program |
| Monday.com | ~20–25% first-year | recurring | ~12 mo | monday.com/affiliate-program/ |
| Pipedrive | 20–30% tiered | recurring | first 12 mo | getlasso.co/affiliate/pipedrive/ |
| FreshBooks | $10/trial + up to $200/sub | **one-time CPA** | — | freshbooks.com/affiliate-program |
| Typeform | 20% | recurring | lifetime (outlier, low-ACV) | getlasso.co/affiliate/typeform/ |
| Notion | 50% | recurring | **12 mo** | aiaffiliateprograms.ai/program/notion |
| QuickBooks ProAdvisor | 30% of base sub | recurring | **first 12 mo** | quickbooks.intuit.com/accountants/.../revenue-share/ |

## 1b. Compliance-SaaS leaders — the direct comparables (LOAD-BEARING)
| Program | Referral | Reseller/MSP | Published %? |
|---|---|---|---|
| **Vanta** | **$500 Visa gift card** per referral (+$1,000 off for the customer) | margin/discount + multi-tenant console + co-sell | **none published** |
| **Drata** | referral incentive via agreement | MSSP/VAR/GSI, services-led | none published |
| **Secureframe** | **$500 Amazon gift card** | reseller discount + MSP portal | none published |
| **Sprinto SPARK** | referral track | consulting/channel co-sell | none published |
- Sources: help.vanta.com/en/articles/11345414 · vanta.com/partners/service-providers · vanta.com/legal/msp-terms · drata.com/partners · secureframe.com/referral-terms · secureframe.com/partners · sprinto.com/partners-program/
- **Finding:** none of the four publishes a % at all; referral cash = flat
  $500-class bounty; consultant/MSP channel = reseller margin + enablement
  + the partner's OWN services revenue (readiness, gap assessments,
  internal audit, vCISO).

## 2. Aggregate data
- PartnerStack avg top-vendor commission **23.53%**; best offers 20/25/30%
  (partnerstack.com/resources/research-lab/charts/...).
- Rewardful benchmarks: avg 22.1–24.5%; **B2B 10–20%**
  (rewardful.com/articles/saas-affiliate-program-benchmarks).
- Reditus/Post Affiliate Pro: mature programs 15–25%; **B2B SaaS 10–20%**;
  **healthy affiliate cost ratio 8–12% of affiliate-sourced revenue**
  (getreditus.com/blog/how-to-set-saas-affiliate-commission-rates).
- **High-ACV nuance:** as ACV rises the % falls; $10K+ consultative B2B →
  10–20% trending LOW and ONE-TIME (track360.io/blog/saas-affiliate-commission-rates-benchmark-2026;
  refgrow.com/referral-fees).

## 3. Motion economics (partner cut of first-year ARR)
| Motion | Typical cut | Structure |
|---|---|---|
| Referral (intro only) | **10–15% one-time** | vendor owns customer |
| Reseller/VAR | 20–30% | margin |
| MSP/agency | 20–35% | runs onboarding/support |
| White-label | 40–60% margin | partner owns fully |
- Sources: channels-as-a-strategy.com/saas-reseller-commission-structure/ ·
  resources.rework.com/libraries/saas-growth/channel-partner-program ·
  magentrix.com/blog/partner-compensation-commission-structures
- In compliance SaaS the consultant's real income = their own services;
  the platform fee is a kicker (vanta.com/resources/how-msps-unlock-growth...).

## 4. Sustainability math
- ~80% gross margin + LTV:CAC 3:1 → total CAC budget ≈ 27% of LTV, shared
  with ALL acquisition costs (saashero.net/strategy/b2b-saas-ltv-cac-benchmarks/).
- **Lifetime recurring = unbounded liability concentrated on the
  best-retained cohorts; fraud becomes an annuity**; market converged on
  12-month caps (track360.io/blog/recurring-commission-affiliate-program-design-2026).
- Worked example (track360): 30% lifetime = 30% of total customer revenue;
  30% capped-12mo = 18%; tiered = 13.5%.
- **AE parity:** a quota-carrying SaaS AE earns ~8–10% of first-year ACV
  (ICONIQ 2025 via quotapath.com/blog/standard-commission-rate/;
  saastr.com/dear-saastr-what-is-the-standard-commission-percentage-in-saas).
  A referral partner cannot out-earn the closer.

## OWNER RULING 2026-07-21 (encoded in architecture.md §9.4)
Track 1, single model: **annual-plan referral = 10% of first-year contract,
one-time** (45-day hold); **monthly-plan referral = 8% of each monthly
payment** while active; **payouts via Stripe** (Connect, monthly, 1099);
90-day cookie; clawback; freemium attributes on first PAID conversion.
Implementation partners: same Track-1 cash + non-cash stack (free seat,
partner portal, co-branding, directory, enablement, co-sell) + 100% of
their own services revenue. v7 Part 16's 25%→10%-lifetime is DEAD.
