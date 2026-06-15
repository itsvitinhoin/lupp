import React from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface CodeBlockProps {
  code: string;
  language?: string;
}

export function CodeBlock({ code, language = 'html' }: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false);
  const { toast } = useToast();

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast({
      title: "Código copiado!",
      description: "O código foi copiado para sua área de transferência.",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative rounded-md bg-slate-950 p-4 font-mono text-sm border border-white/10">
      <Button
        size="icon"
        variant="ghost"
        className="absolute right-2 top-2 h-8 w-8 text-muted-foreground hover:text-white"
        onClick={handleCopy}
      >
        {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
      </Button>
      <pre className="overflow-x-auto text-slate-300">
        <code>{code}</code>
      </pre>
    </div>
  );
}
