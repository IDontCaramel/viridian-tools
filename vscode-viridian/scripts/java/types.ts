// maps the mod's codec expressions to catalog data type names (see catalog/data-types.json)

import type { DataType, TypeRef } from "../../src/catalog/types.ts";

const CALIO: Record<string, TypeRef> = {
  BOOLEAN: "boolean",
  INT: "int",
  FLOAT: "float",
  DOUBLE: "double",
  NUMBER: "double",
  STRING: "string",
  TEXT: "text",
  IDENTIFIER: "identifier",
  NBT: "nbt",
  POSITIVE_INT: "positive_int",
  POSITIVE_FLOAT: "positive_float",
  POSITIVE_DOUBLE: "positive_double",
  ITEM: "item",
  ITEM_STACK: "item_stack",
  ITEM_STACKS: "list<item_stack>",
  INGREDIENT: "ingredient",
  STATUS_EFFECT_INSTANCE: "status_effect_instance",
  STATUS_EFFECT_INSTANCES: "list<status_effect_instance>",
  ATTRIBUTE_MODIFIER: "attribute_modifier",
  ATTRIBUTED_ATTRIBUTE_MODIFIER: "attributed_attribute_modifier",
  ATTRIBUTE_MODIFIERS: "list<attribute_modifier>",
  ATTRIBUTED_ATTRIBUTE_MODIFIERS: "list<attributed_attribute_modifier>",
  SOUND_EVENT: "sound_event",
  PARTICLE_EFFECT_OR_TYPE: "particle_effect_or_type",
  PARTICLE_EFFECT: "particle_effect",
  KEY: "key",
  BACKWARDS_COMPATIBLE_KEY: "key",
  SINGLE_HUD_RENDER: "hud_render",
  HUD_RENDER: "hud_render",
  MODIFIER: "modifier",
  MODIFIERS: "list<modifier>",
  STATUS_EFFECT: "status_effect",
  PARTICLE_TYPE: "particle_type",
  ITEM_TAG: "item_tag",
  BLOCK_TAG: "block_tag",
  FLUID_TAG: "fluid_tag",
  ENTITY_TAG: "entity_type_tag",
  BIOME_TAG: "biome_tag",
  BLOCK: "block",
  BLOCK_STATE: "block_state",
  VECTOR: "vector",
  STAT: "stat",
};

const CODECS: Record<string, TypeRef> = {
  "HudRender.CODEC": "hud_render",
  "HudRender.SINGLE_CODEC": "hud_render",
  "ItemStackData.CODEC": "item_stack",
  "DamageSourceDescription.CODEC": "damage_source",
  "KeyBindingData.CODEC": "key",
  "KeyBindingData.BACKWARDS_COMPATIBLE_CODEC": "key",
  "LegacyFoodData.CODEC": "food_component",
  "EntityCondition.CODEC": "entity_condition",
  "Modifier.CODEC": "modifier",
  "ParticleData.CODEC": "particle_effect_or_type",
  "ParticleData.OBJECT_CODEC": "particle_effect",
  "AttributeModifierData.CODEC": "attribute_modifier",
  "AttributeModifierData.ATTRIBUTED_CODEC": "attributed_attribute_modifier",
  "IngredientData.CODEC": "ingredient",
  "StatusEffectData.CODEC": "status_effect_instance",
  "Impact.CODEC": "impact",
};

export function codecConstantType(raw: string): TypeRef | undefined {
  const calio = raw.match(/^(?:CalioDataTypes\.)?([A-Z_]+)$/);
  if (calio && raw.startsWith("CalioDataTypes.")) return CALIO[calio[1]!];
  return CODECS[raw];
}

// CalioDataTypes.registry(BuiltInRegistries.X) and registryKey(Registries.X)
export function registryType(raw: string): TypeRef | undefined {
  const match = raw.match(/^(?:BuiltInRegistries|Registries)\.([A-Z_]+)$/);
  return match ? match[1]!.toLowerCase() : undefined;
}

export function tagType(raw: string): TypeRef | undefined {
  const match = raw.match(/^Registries\.([A-Z_]+)$/);
  return match ? `${match[1]!.toLowerCase()}_tag` : undefined;
}

// enum constants of the minecraft enums the mod reads, copied from the 26.3 sources
// (minecraft-common-26.3-sources.jar in the mod's loom cache)
const MINECRAFT_ENUMS: Record<string, { name: string; values: string[] }> = {
  Direction: { name: "direction", values: ["down", "up", "north", "south", "west", "east"] },
  "Direction.Axis": { name: "axis", values: ["x", "y", "z"] },
  EquipmentSlot: {
    name: "equipment_slot",
    values: ["mainhand", "offhand", "feet", "legs", "chest", "head", "body", "saddle"],
  },
  InteractionHand: { name: "hand", values: ["main_hand", "off_hand"] },
  "ClipContext.Block": { name: "shape_type", values: ["collider", "outline", "visual", "falldamage_resetting"] },
  "ClipContext.Fluid": { name: "fluid_handling", values: ["none", "source_only", "any", "water"] },
  "Heightmap.Types": {
    name: "heightmap",
    values: [
      "world_surface_wg",
      "world_surface",
      "ocean_floor_wg",
      "ocean_floor",
      "motion_blocking",
      "motion_blocking_no_leaves",
    ],
  },
  SoundSource: {
    name: "sound_category",
    values: ["master", "music", "records", "weather", "blocks", "hostile", "neutral", "players", "ambient", "voice", "ui"],
  },
  LightLayer: { name: "light_type", values: ["sky", "block"] },
  GameType: { name: "game_mode", values: ["survival", "creative", "adventure", "spectator"] },
  "Biome.Precipitation": { name: "precipitation", values: ["none", "rain", "snow"] },
  "GameEventListener.DeliveryMode": { name: "game_event_delivery_mode", values: ["unspecified", "by_distance"] },
};

export function minecraftEnum(raw: string): { name: string; values: string[] } | undefined {
  return MINECRAFT_ENUMS[raw];
}

export function allMinecraftEnums(): Record<string, DataType> {
  return Object.fromEntries(
    Object.values(MINECRAFT_ENUMS).map(({ name, values }) => [name, { kind: "enum", values } satisfies DataType]),
  );
}
