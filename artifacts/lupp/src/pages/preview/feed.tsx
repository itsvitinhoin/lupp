import React from 'react';
import { Button } from '@/components/ui/button';
import { Heart, MessageCircle, Share2, Bookmark, ArrowLeft } from 'lucide-react';
import { mockVideos } from '@/data/mock';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { LuppLogo } from '@/components/shared/LuppLogo';

export default function PreviewFeed() {
  const { toast } = useToast();
  const [activeVideo, setActiveVideo] = React.useState(0);
  const [likedMap, setLikedMap] = React.useState<Record<number, boolean>>({});

  const handleLike = (index: number) => {
    setLikedMap(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const handleAction = (action: string) => {
    toast({
      title: action,
      description: "Ação registrada no preview.",
    });
  };

  const gradients = [
    'from-blue-900 via-slate-900',
    'from-indigo-900 via-slate-900',
    'from-purple-900 via-slate-900',
    'from-teal-900 via-slate-900',
    'from-emerald-900 via-slate-900',
  ];

  return (
    <div className="h-[100dvh] w-full bg-black overflow-hidden flex justify-center text-white">
      {/* Mobile container constraint for desktop viewing */}
      <div className="relative w-full h-full max-w-[420px] bg-slate-950 flex flex-col">
        
        {/* Top Navigation Overlay */}
        <div className="absolute top-0 left-0 right-0 z-50 p-4 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent">
          <Button variant="ghost" size="icon" asChild className="text-white hover:bg-white/20">
            <Link href="/app/feed"><ArrowLeft className="h-6 w-6" /></Link>
          </Button>
          <div className="flex items-center gap-2 font-bold text-lg">
            Bella Moda
          </div>
          <div className="w-10"></div> {/* Spacer */}
        </div>

        {/* Feed Container */}
        <div className="h-full w-full overflow-y-auto snap-y snap-mandatory" style={{ scrollbarWidth: 'none' }}>
          {mockVideos.filter(v => v.productName).map((video, index) => (
            <div key={video.id} className="relative h-full w-full snap-start flex-shrink-0 bg-black">
              {/* Video Background Mock */}
              <div className={`absolute inset-0 bg-gradient-to-br ${gradients[index % gradients.length]} to-black opacity-80`}></div>
              
              {/* Floating watermark */}
              <div className="absolute top-16 right-4 opacity-30 scale-75">
                <LuppLogo />
              </div>

              {/* Bottom UI Overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/60 to-transparent p-4 pt-32">
                <div className="mb-4 pr-16">
                  <h3 className="text-white font-medium text-lg mb-1">{video.title}</h3>
                  <p className="text-white/80 text-sm line-clamp-2">Veja os detalhes incríveis dessa peça exclusiva da nossa nova coleção. Clique no link para comprar.</p>
                </div>
                
                {/* Product Card */}
                <div className="rounded-xl bg-black/40 backdrop-blur-xl border border-white/20 p-3 mb-2">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-12 w-12 rounded-md bg-white/10 shrink-0"></div>
                    <div className="flex-1 overflow-hidden">
                      <p className="text-sm font-bold text-white truncate">{video.productName}</p>
                      <p className="text-sm text-primary font-medium">R$ 189,90</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      className="flex-1 h-9 bg-transparent border-white/20 text-white hover:bg-white/10 hover:text-white"
                      onClick={() => handleAction('Produto aberto')}
                    >
                      Ver detalhes
                    </Button>
                    <Button 
                      className="flex-1 h-9 bg-primary hover:bg-primary/90 text-primary-foreground"
                      onClick={() => handleAction('Adicionado ao carrinho!')}
                    >
                      Comprar agora
                    </Button>
                  </div>
                </div>
              </div>

              {/* Right Side Actions */}
              <div className="absolute right-2 bottom-32 flex flex-col items-center gap-6">
                <button className="flex flex-col items-center gap-1 group" onClick={() => handleLike(index)}>
                  <div className="rounded-full bg-black/20 p-3 backdrop-blur-md">
                    <Heart className="h-7 w-7 transition-all" fill={likedMap[index] ? "#FF4D6D" : "transparent"} stroke={likedMap[index] ? "#FF4D6D" : "white"} />
                  </div>
                  <span className="text-xs font-bold text-white shadow-sm">{likedMap[index] ? video.likes + 1 : video.likes}</span>
                </button>
                <button className="flex flex-col items-center gap-1 text-white">
                  <div className="rounded-full bg-black/20 p-3 backdrop-blur-md">
                    <MessageCircle className="h-7 w-7" />
                  </div>
                  <span className="text-xs font-bold">{video.comments}</span>
                </button>
                <button className="flex flex-col items-center gap-1 text-white">
                  <div className="rounded-full bg-black/20 p-3 backdrop-blur-md">
                    <Bookmark className="h-7 w-7" />
                  </div>
                </button>
                <button className="flex flex-col items-center gap-1 text-white" onClick={() => handleAction('Link copiado!')}>
                  <div className="rounded-full bg-black/20 p-3 backdrop-blur-md">
                    <Share2 className="h-7 w-7" />
                  </div>
                  <span className="text-xs font-bold">Share</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
