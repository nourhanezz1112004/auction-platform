import { AuctionCard } from './AuctionCard'

type Props = {
  recommendations: any[];
}

export function RecommendedList({ recommendations }: Props) {
  if (!recommendations || recommendations.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-4">
      <div className="flex items-center justify-between mb-8 border-b border-border-base pb-4">
        <div className="flex flex-col md:flex-row md:items-baseline gap-2">
          <div className="flex items-center gap-2.5">
            <h2 className="font-serif italic text-2xl md:text-3xl text-text-primary font-medium">The Curator's Sanctuary Selections</h2>
            <span className="px-2 py-0.5 rounded-none border border-primary/20 bg-primary/5 text-primary text-[9px] font-bold uppercase tracking-wider">AI</span>
          </div>
          <span className="text-sm md:text-base text-primary font-bold md:ml-3" style={{ fontFamily: 'Amiri, serif' }}>مختارات بعناية فائقة للأعضاء</span>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
        {recommendations.slice(0, 4).map((auction, i) => (
          <AuctionCard key={auction.id} auction={auction} index={i} />
        ))}
      </div>
    </section>
  )
}
