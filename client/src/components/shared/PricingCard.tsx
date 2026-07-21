import React from 'react';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

interface PricingCardProps {
  name: string;
  price: number;
  features: string[];
  isPopular?: boolean;
  ctaText?: string;
  onSelect?: () => void;
  selected?: boolean;
}

export function PricingCard({ name, price, features, isPopular, ctaText = 'Assinar agora', onSelect, selected }: PricingCardProps) {
  return (
    <Card className={`relative overflow-hidden bg-card transition-all ${isPopular ? 'border-primary shadow-lg shadow-primary/20' : ''} ${selected ? 'ring-2 ring-primary' : ''}`}>
      {isPopular && (
        <div className="absolute top-0 right-0 rounded-bl-lg rounded-tr-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
          Mais popular
        </div>
      )}
      <CardHeader>
        <h3 className="text-xl font-bold text-foreground">{name}</h3>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-3xl font-bold text-foreground">R${price}</span>
          <span className="text-sm text-muted-foreground">/mês</span>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3 text-sm">
          {features.map((feature, i) => (
            <li key={i} className="flex items-center gap-2">
              <Check className="h-4 w-4 text-success" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <Button 
          className="w-full" 
          variant={isPopular ? 'default' : 'outline'}
          onClick={onSelect}
        >
          {ctaText}
        </Button>
      </CardFooter>
    </Card>
  );
}
