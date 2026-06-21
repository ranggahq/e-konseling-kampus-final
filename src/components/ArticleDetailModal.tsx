import React from 'react';
import { X, Calendar, User, Clock } from 'lucide-react';
import { Article } from '../types';

interface ArticleDetailModalProps {
  article: Article;
  onClose: () => void;
  onLikeToggle?: (articleId: string) => void;
}

export default function ArticleDetailModal({ article, onClose, onLikeToggle }: ArticleDetailModalProps) {
  // Simple paragraph styling parser to represent clean structured paragraphs
  const renderFormattedContent = (content: string) => {
    return content.split('\n\n').map((paragraph, index) => {
      // Check if heading line
      if (paragraph.startsWith('### ')) {
        const headingText = paragraph.replace('### ', '');
        return (
          <h4 key={index} className="text-lg font-bold text-slate-800 mt-6 mb-3 font-display">
            {headingText}
          </h4>
        );
      }
      if (paragraph.startsWith('1. ') || paragraph.startsWith('- ')) {
        const items = paragraph.split('\n');
        return (
          <div key={index} className="my-4 space-y-2">
            {items.map((item, keyIdx) => {
              const cleanedText = item.replace(/^(\d+\.\s*|-\s*)/, '');
              const isNumbered = item.match(/^\d+\./);
              return (
                <div key={keyIdx} className="flex items-start gap-2.5 text-sm md:text-base text-slate-600 leading-relaxed pl-2">
                  <span className={`flex-shrink-0 text-indigo-600 font-semibold mt-0.5 ${isNumbered ? 'text-sm' : 'text-xs'}`}>
                    {isNumbered ? `${keyIdx + 1}.` : '•'}
                  </span>
                  <p className="flex-1">
                    {/* Parse bold texts: **text** */}
                    {cleanedText.split('**').map((part, pIdx) => 
                      pIdx % 2 === 1 ? <strong key={pIdx} className="font-semibold text-slate-800">{part}</strong> : part
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        );
      }
      
      // Standard text passage
      const formattedTextParts = paragraph.split('**').map((chunk, chunkIdx) => {
        if (chunkIdx % 2 === 1) {
          return <strong key={chunkIdx} className="font-semibold text-slate-800">{chunk}</strong>;
        }
        // Also parse emphasis / italic: *text*
        return chunk.split('*').map((item, itemIdx) => 
          itemIdx % 2 === 1 ? <em key={itemIdx} className="italic text-slate-700">{item}</em> : item
        );
      });

      return (
        <p key={index} className="text-sm md:text-base text-slate-600 leading-relaxed mb-4 text-justify">
          {formattedTextParts}
        </p>
      );
    });
  };

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'Kecemasan': return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'Stres': return 'bg-rose-50 text-rose-800 border-rose-200';
      case 'Depresi': return 'bg-indigo-50 text-indigo-800 border-indigo-200';
      case 'Relationship': return 'bg-pink-50 text-pink-800 border-pink-200';
      case 'Akademik': return 'bg-indigo-50 text-indigo-805 border-indigo-200';
      default: return 'bg-slate-50 text-slate-800 border-slate-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div 
        className="relative w-full max-w-3xl bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-100 flex flex-col my-8 animate-in fade-in duration-300 max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button Top Right */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2.5 bg-slate-900/60 text-white rounded-full hover:bg-slate-900/80 transition-colors shadow-md"
          title="Tutup Artikel"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Hero Image */}
        <div className="h-56 md:h-72 relative">
          <img 
            src={article.imageUrl} 
            alt={article.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/30 to-transparent"></div>
          
          <div className="absolute bottom-6 left-6 right-6">
            <span className={`inline-block px-3 py-1 text-xs font-semibold rounded-full border mb-3 ${getCategoryColor(article.category)}`}>
              {article.category}
            </span>
            <h3 className="text-xl md:text-3xl font-extrabold text-white leading-tight font-display text-shadow-sm">
              {article.title}
            </h3>
          </div>
        </div>

        {/* Authorship & Reading Meta */}
        <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <User className="w-4 h-4 text-slate-400" />
              <div>
                <p className="font-semibold text-slate-700">{article.author}</p>
                <p className="text-[10px] text-slate-400">{article.authorRole}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 border-l border-slate-200 pl-4 h-6">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span>{article.date}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-slate-400" />
            <span>{article.minutesToRead} Menit Bacaan</span>
          </div>
        </div>

        {/* Article Body Content Scroll Container */}
        <div className="flex-1 overflow-y-auto px-6 md:px-8 py-6">
          <p className="text-base italic text-slate-500 bg-slate-50 border-l-4 border-indigo-500 pl-4 py-3 rounded-r-xl mb-6">
            "{article.excerpt}"
          </p>
          <div className="prose prose-slate max-w-none">
            {renderFormattedContent(article.content)}
          </div>
        </div>

        {/* Footer Actions (Simple Close without social metrics) */}
        <div className="px-6 md:px-8 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button 
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-705 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-3xs"
          >
            Selesai Membaca
          </button>
        </div>
      </div>
    </div>
  );
}
