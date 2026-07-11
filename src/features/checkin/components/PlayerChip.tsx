import { Badge } from '@/components/ui/badge';
import { X, GripVertical } from 'lucide-react';
import type { Player, PlayerStatus } from '@/types/tournament';

const STATUS_CONFIG: Record<PlayerStatus, { dot: string; label: string }> = {
  unknown: { dot: 'bg-gray-400', label: '' },
  in: { dot: 'bg-green-500', label: 'IN' },
  out: { dot: 'bg-red-500', label: 'OUT' },
  late: { dot: 'bg-yellow-500', label: 'LATE' },
};

const NEXT_STATUS: Record<PlayerStatus, PlayerStatus> = {
  unknown: 'in',
  in: 'late',
  late: 'out',
  out: 'unknown',
};

const LINK_COLORS: Record<string, string> = {
  A: 'bg-blue-500', B: 'bg-purple-500', C: 'bg-pink-500', D: 'bg-cyan-500',
  E: 'bg-orange-500', F: 'bg-teal-500', G: 'bg-indigo-500', H: 'bg-rose-500',
};

const LINK_GROUPS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

interface Props {
  player: Player;
  onRemove?: () => void;
  onStatusChange?: (status: PlayerStatus) => void;
  onLinkChange?: (group: string | null) => void;
  draggable?: boolean;
  highlighted?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function PlayerChip({ player, onRemove, onStatusChange, onLinkChange, draggable = true, highlighted, onMouseEnter, onMouseLeave }: Props) {
  const config = STATUS_CONFIG[player.status ?? 'unknown'];
  const linkColor = player.linkGroup ? LINK_COLORS[player.linkGroup] ?? 'bg-gray-500' : null;

  return (
    <Badge
      variant="secondary"
      className={`gap-1 py-1 px-2 text-xs select-none transition-all ${draggable ? 'cursor-grab active:cursor-grabbing' : ''} ${
        player.status === 'out' ? 'opacity-40 line-through' : ''
      } ${highlighted ? 'ring-2 ring-blue-400 bg-blue-500/10' : ''}`}
      draggable={draggable}
      onDragStart={e => {
        e.dataTransfer.setData('application/vb-player-id', player.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {draggable && <GripVertical className="h-3 w-3 text-muted-foreground/50" />}
      {onStatusChange && (
        <button
          onClick={e => {
            e.stopPropagation();
            const next = NEXT_STATUS[player.status ?? 'unknown'];
            onStatusChange(next);
          }}
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${config.dot} hover:ring-2 hover:ring-offset-1 hover:ring-primary`}
          title={`Status: ${config.label || 'Unknown'} (click to change)`}
        />
      )}
      {onLinkChange ? (
        <button
          onClick={e => {
            e.stopPropagation();
            const current = player.linkGroup;
            if (!current) {
              onLinkChange('A');
            } else {
              const idx = (LINK_GROUPS as readonly string[]).indexOf(current);
              onLinkChange(idx < LINK_GROUPS.length - 1 ? LINK_GROUPS[idx + 1] : null);
            }
          }}
          className={`w-3.5 h-3.5 rounded-full text-[8px] font-bold text-white flex items-center justify-center shrink-0 hover:ring-2 hover:ring-offset-1 hover:ring-primary ${linkColor ?? 'bg-gray-600'}`}
          title={player.linkGroup ? `Linked: ${player.linkGroup} (click to change)` : 'Click to link (A-F)'}
        >
          {player.linkGroup ?? '~'}
        </button>
      ) : linkColor && (
        <span className={`w-3.5 h-3.5 rounded-full text-[8px] font-bold text-white flex items-center justify-center shrink-0 ${linkColor}`}>
          {player.linkGroup}
        </span>
      )}
      {player.name}
      {config.label && (
        <span className={`text-[9px] font-semibold ${
          player.status === 'in' ? 'text-green-600 dark:text-green-400' :
          player.status === 'out' ? 'text-red-500' :
          player.status === 'late' ? 'text-yellow-600 dark:text-yellow-400' : ''
        }`}>
          {config.label}
        </span>
      )}
      {onRemove && (
        <button
          onClick={e => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 hover:text-destructive"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </Badge>
  );
}
