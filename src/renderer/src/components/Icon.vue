<script setup lang="ts">
/**
 * Icon wrapper over lucide-vue-next. Keeps the original `<Icon name=".." />`
 * API used across the app, mapping our internal names to lucide components so
 * no call site has to change. Falls back to a neutral dot for unknown names.
 */
import { computed } from "vue";
import {
  House,
  Settings,
  Play,
  Pause,
  Download,
  Clock,
  Box,
  Calendar,
  Search,
  User,
  Users,
  Plus,
  Grid2x2 as MicrosoftGrid,
  Paintbrush,
  Globe,
  Folder,
  Shield,
  Cpu,
  MessageCircle,
  Code,
  Video,
  MemoryStick,
  Rocket,
  Check,
  ChevronRight,
  ExternalLink,
  Shirt,
  Gauge,
  Minus,
  Square,
  X,
  Crown,
  LoaderCircle,
  Trash2,
  RefreshCw,
  TriangleAlert,
  CircleAlert,
  Menu,
  SlidersHorizontal,
  Store,
  PackageCheck,
  Power,
  PowerOff,
  List,
  Layers3,
  Tag,
  ArrowDownUp,
  Image,
  Undo2,
  Eraser,
  Save,
  Upload,
  LogOut,
  Palette,
  Pencil,
  Eye,
  EyeOff,
  PanelRightClose,
  ChevronLeft,
  Copy,
  Gamepad2,
  HardDrive,
  Images,
  Ban,
  ArrowDown,
  ArrowUp,
  Sparkles,
  Pipette,
  PaintBucket,
  Rotate3D,
  Maximize2,
  CheckSquare2,
  SquareMousePointer,
  ZoomIn,
  ZoomOut,
  Puzzle,
} from "lucide-vue-next";
import type { FunctionalComponent } from "vue";

type IconComp = FunctionalComponent<Record<string, unknown>>;

const props = withDefaults(
  defineProps<{ name: string; size?: number | string; stroke?: number }>(),
  { size: 20, stroke: 2 },
);

const map: Record<string, IconComp> = {
  home: House,
  mods: Puzzle,
  cube: Box,
  settings: Settings,
  play: Play,
  pause: Pause,
  download: Download,
  clock: Clock,
  calendar: Calendar,
  search: Search,
  user: User,
  users: Users,
  plus: Plus,
  microsoft: MicrosoftGrid,
  brush: Paintbrush,
  globe: Globe,
  folder: Folder,
  shield: Shield,
  chip: Cpu,
  discord: MessageCircle,
  code: Code,
  video: Video,
  memory: MemoryStick,
  rocket: Rocket,
  check: Check,
  chevron: ChevronRight,
  external: ExternalLink,
  shirt: Shirt,
  gauge: Gauge,
  minimize: Minus,
  maximize: Square,
  close: X,
  crown: Crown,
  spinner: LoaderCircle,
  trash: Trash2,
  refresh: RefreshCw,
  alert: TriangleAlert,
  warning: CircleAlert,
  menu: Menu,
  filters: SlidersHorizontal,
  market: Store,
  installed: PackageCheck,
  power: Power,
  powerOff: PowerOff,
  list: List,
  layers: Layers3,
  tag: Tag,
  sort: ArrowDownUp,
  image: Image,
  undo: Undo2,
  eraser: Eraser,
  save: Save,
  upload: Upload,
  logout: LogOut,
  palette: Palette,
  pencil: Pencil,
  eye: Eye,
  eyeOff: EyeOff,
  panelClose: PanelRightClose,
  back: ChevronLeft,
  copy: Copy,
  gamepad: Gamepad2,
  drive: HardDrive,
  gallery: Images,
  slash: Ban,
  sliders: SlidersHorizontal,
  arrowDown: ArrowDown,
  arrowUp: ArrowUp,
  sparkles: Sparkles,
  picker: Pipette,
  fill: PaintBucket,
  rotate3d: Rotate3D,
  expand: Maximize2,
  checkSquare: CheckSquare2,
  select: SquareMousePointer,
  zoomIn: ZoomIn,
  zoomOut: ZoomOut,
};

const comp = computed<IconComp>(
  () => map[props.name] ?? (CircleAlert as IconComp),
);
const px = computed(() =>
  typeof props.size === "number" ? props.size : props.size,
);
</script>

<template>
  <component
    :is="comp"
    :size="px"
    :stroke-width="stroke"
    :absolute-stroke-width="true"
    class="icon"
    aria-hidden="true"
  />
</template>

<style scoped>
.icon {
  display: block;
  flex: none;
  shape-rendering: geometricPrecision;
}
</style>
