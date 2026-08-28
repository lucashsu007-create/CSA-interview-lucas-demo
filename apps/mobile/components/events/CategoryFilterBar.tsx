/**
 * The five category filters, plus "All".
 *
 * The categories come from `EVENT_CATEGORIES` in `@csa/domain`, which is the
 * closed enum from contract section 3. Nothing here writes the list by hand, so
 * a category cannot be added to a screen without being added to the schema.
 *
 * Every chip does something: the selection is passed to `GET /api/events` as
 * `?category=`. A filter that only looks substantial is the specific kind of
 * fake complexity this project forbids.
 */
import { space } from "@csa/design-tokens";
import { EVENT_CATEGORIES, type EventCategory } from "@csa/domain";
import { ScrollView } from "react-native";

import { FilterChip } from "@/components/ui/FilterChip";
import { categoryLabel } from "@/lib/format";

export interface CategoryFilterBarProps {
  selected: EventCategory | null;
  onSelect: (category: EventCategory | null) => void;
  /** Horizontal breathing room, matched to the screen's own gutter. */
  gutter: number;
}

export function CategoryFilterBar({ selected, onSelect, gutter }: CategoryFilterBarProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      contentContainerStyle={{
        columnGap: space[2],
        paddingHorizontal: gutter,
        paddingVertical: space[2],
      }}
    >
      <FilterChip
        label="All"
        selected={selected === null}
        onPress={() => onSelect(null)}
        accessibilityHint="Shows events in every category"
      />
      {EVENT_CATEGORIES.map((category) => (
        <FilterChip
          key={category}
          label={categoryLabel(category)}
          selected={selected === category}
          onPress={() => onSelect(category)}
          accessibilityHint={`Shows only ${categoryLabel(category).toLowerCase()} events`}
        />
      ))}
    </ScrollView>
  );
}
