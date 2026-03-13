import { Button } from '@/components/ui/button';

export type PlatformFilterValue = 'all' | 'Pendle' | 'Spectra' | 'Exponent' | 'RateX';

interface PlatformFilterProps {
  value: PlatformFilterValue;
  onChange: (value: PlatformFilterValue) => void;
}

const PLATFORMS: { value: PlatformFilterValue; label: string; activeClass: string }[] = [
  { value: 'all', label: 'Все', activeClass: '' },
  { value: 'Pendle', label: 'Pendle', activeClass: 'border-primary text-primary' },
  { value: 'Spectra', label: 'Spectra', activeClass: 'border-purple-500 text-purple-500' },
  { value: 'Exponent', label: 'Exponent', activeClass: 'border-orange-500 text-orange-500' },
  { value: 'RateX', label: 'RateX', activeClass: 'border-blue-500 text-blue-500' },
];

export function PlatformFilter({ value, onChange }: PlatformFilterProps) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {PLATFORMS.map((p) => {
        const isActive = value === p.value;
        return (
          <Button
            key={p.value}
            variant={isActive ? 'outline' : 'ghost'}
            size="sm"
            onClick={() => onChange(p.value)}
            className={`text-xs h-7 px-3 ${isActive && p.activeClass ? p.activeClass : ''}`}
          >
            {p.label}
          </Button>
        );
      })}
    </div>
  );
}
