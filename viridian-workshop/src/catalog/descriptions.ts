// plain language labels and descriptions shown in the template picker and on cards
// keyed by type path, the catalog decides which types exist, this only explains them
import type { Category } from './catalog'

export interface TypeInfo {
  label: string
  description: string
  group: string
}

type Entry = [group: string, label: string, description: string]

const POWER_TYPES: Record<string, Entry> = {
  // triggers
  action_on_key_press: [
    'Triggers',
    'Use a key',
    'Runs an action when the player presses a key, with an optional cooldown.',
  ],
  active_self: ['Triggers', 'Use a key', 'Old name for "Use a key".'],
  action_over_time: [
    'Triggers',
    'Repeat over time',
    'Runs an action every few ticks, and optionally when the power turns on or off.',
  ],
  action_on_callback: [
    'Triggers',
    'On gain, loss or respawn',
    'Runs actions when the power is gained, lost, added, removed, or when the player respawns.',
  ],
  action_on_land: ['Triggers', 'On landing', 'Runs an action when the player lands on the ground.'],
  action_on_wake_up: ['Triggers', 'On waking up', 'Runs an action when the player wakes up in a bed.'],
  action_on_death: ['Triggers', 'On death', 'Runs an action when the player dies.'],
  action_on_hit: ['Triggers', 'On hitting', 'Runs a two-entity action when the player hits another entity.'],
  action_when_hit: ['Triggers', 'When hit', 'Runs a two-entity action when another entity hits the player.'],
  action_when_damage_taken: ['Triggers', 'When taking damage', 'Runs an action on the player when they take damage.'],
  self_action_when_hit: ['Triggers', 'When taking damage', 'Old name for "When taking damage".'],
  attacker_action_when_hit: ['Triggers', 'On attacker when hit', 'Runs an action on whoever damaged the player.'],
  self_action_on_hit: ['Triggers', 'On self when hitting', 'Runs an action on the player when they damage something.'],
  target_action_on_hit: ['Triggers', 'On target when hitting', 'Runs an action on whatever the player damages.'],
  self_action_on_kill: ['Triggers', 'On kill', 'Runs an action on the player when they kill something.'],
  action_on_block_break: ['Triggers', 'On breaking a block', 'Runs actions when the player breaks a block.'],
  action_on_block_place: ['Triggers', 'On placing a block', 'Runs actions when the player places a block.'],
  action_on_block_use: ['Triggers', 'On using a block', 'Runs actions when the player right-clicks a block.'],
  action_on_entity_use: ['Triggers', 'On using an entity', 'Runs actions when the player right-clicks an entity.'],
  action_on_being_used: ['Triggers', 'On being used', 'Runs actions when another player right-clicks this player.'],
  action_on_item_use: ['Triggers', 'On using an item', 'Runs actions when the player uses an item.'],
  action_on_item_pickup: ['Triggers', 'On picking up items', 'Runs actions when the player picks up an item.'],
  game_event_listener: [
    'Triggers',
    'Listen for game events',
    'Runs actions when a game event (like a sound or vibration) happens nearby.',
  ],
  launch: ['Triggers', 'Launch into the air', 'Launches the player upwards when a key is pressed.'],
  fire_projectile: ['Triggers', 'Fire a projectile', 'Shoots projectiles when a key is pressed.'],

  // state
  toggle: [
    'State',
    'Toggle',
    'A power the player can switch on and off with a key. Other powers can check if it is active.',
  ],
  resource: ['State', 'Resource bar', 'A number between a minimum and maximum, like mana. Can be shown as a bar.'],
  cooldown: ['State', 'Cooldown', 'A timer other powers can start and check.'],
  dummy: ['State', 'Do nothing', 'A power with no effect, useful as a placeholder or for badges.'],
  simple: ['State', 'Do nothing', 'Old name for "Do nothing".'],
  multiple: [
    'State',
    'Several powers in one',
    'Groups several sub-powers into one file. Every extra field is a sub-power.',
  ],
  entity_set: [
    'State',
    'Remember entities',
    'Keeps a list of entities that actions can add to, remove from and check.',
  ],
  inventory: ['State', 'Extra inventory', 'Gives the player an extra inventory opened with a key.'],
  starting_equipment: ['State', 'Starting items', 'Gives items when the power is gained, and optionally on respawn.'],
  keep_inventory: ['State', 'Keep items on death', 'Keeps some or all items when the player dies.'],
  recipe: ['State', 'Extra recipe', 'Adds a crafting recipe only this player can use.'],

  // attributes
  attribute: ['Attributes', 'Change attributes', 'Permanently changes attributes like max health or attack damage.'],
  conditioned_attribute: ['Attributes', 'Change attributes when', 'Changes attributes while a condition is met.'],
  modify_attribute: [
    'Attributes',
    'Modify attribute value',
    'Modifies the value of an attribute while the power is active.',
  ],
  attribute_modify_transfer: [
    'Attributes',
    'Attribute from other powers',
    'Lets modifiers from other power types also change an attribute.',
  ],
  modify_damage_dealt: ['Attributes', 'Deal more or less damage', 'Changes the damage the player deals.'],
  modify_damage_taken: ['Attributes', 'Take more or less damage', 'Changes the damage the player takes.'],
  modify_projectile_damage: ['Attributes', 'Projectile damage', "Changes the damage of the player's projectiles."],
  modify_break_speed: ['Attributes', 'Mining speed', 'Changes how fast the player breaks blocks.'],
  modify_harvest: ['Attributes', 'Harvest blocks', 'Allows or prevents getting drops from certain blocks.'],
  modify_healing: ['Attributes', 'Healing amount', 'Changes how much the player heals.'],
  modify_exhaustion: ['Attributes', 'Hunger drain', 'Changes how fast the player gets hungry.'],
  modify_xp_gain: ['Attributes', 'Experience gain', 'Changes how much experience the player gets.'],
  modify_enchantment_level: [
    'Attributes',
    'Enchantment level',
    "Changes the level of enchantments on the player's items.",
  ],
  modify_status_effect_amplifier: [
    'Attributes',
    'Effect strength',
    'Changes the amplifier of status effects on the player.',
  ],
  modify_status_effect_duration: [
    'Attributes',
    'Effect duration',
    'Changes how long status effects last on the player.',
  ],
  modify_insomnia_ticks: ['Attributes', 'Phantom timer', 'Changes how fast phantoms start to spawn.'],
  modify_food: ['Attributes', 'Food value', 'Changes how much food and saturation items give.'],
  stacking_status_effect: ['Attributes', 'Stacking effect', 'Gives effects that build up while a condition is met.'],

  // movement
  modify_jump: ['Movement', 'Jump height', 'Changes how high the player jumps.'],
  modify_falling: ['Movement', 'Falling speed', 'Changes how fast the player falls, and if they take fall damage.'],
  modify_velocity: ['Movement', 'Movement speed', "Changes the player's velocity."],
  modify_air_speed: ['Movement', 'Air speed', 'Changes how fast the player moves in the air.'],
  modify_swim_speed: ['Movement', 'Swim speed', 'Changes how fast the player swims.'],
  modify_lava_speed: ['Movement', 'Lava speed', 'Changes how fast the player moves in lava.'],
  modify_slipperiness: ['Movement', 'Slipperiness', 'Changes how slippery blocks are for the player.'],
  climbing: ['Movement', 'Climb walls', 'Lets the player climb walls like a ladder.'],
  creative_flight: ['Movement', 'Creative flight', 'Lets the player fly like in creative mode.'],
  elytra_flight: ['Movement', 'Elytra flight', 'Lets the player glide without wearing an elytra.'],
  phasing: ['Movement', 'Walk through blocks', 'Lets the player move through blocks.'],
  swimming: ['Movement', 'Swim anywhere', 'Makes the player swim even outside of water.'],
  walk_on_fluid: ['Movement', 'Walk on fluid', 'Lets the player walk on top of water or lava.'],
  ignore_water: ['Movement', 'Ignore water', 'Water does not slow the player down or push them.'],
  grounded: ['Movement', 'Grounded', 'Makes the game treat the player as on the ground.'],
  modify_player_spawn: ['Movement', 'Spawn location', 'Changes where the player spawns.'],

  // survival
  invulnerability: ['Survival', 'Damage immunity', 'Makes the player immune to some kinds of damage.'],
  fire_immunity: ['Survival', 'Fire immunity', 'Makes the player immune to fire and lava damage.'],
  effect_immunity: ['Survival', 'Effect immunity', 'Makes the player immune to certain status effects.'],
  prevent_death: ['Survival', 'Cheat death', 'Stops the player from dying, optionally running an action.'],
  damage_over_time: ['Survival', 'Damage over time', 'Damages the player every few ticks while a condition is met.'],
  burn: ['Survival', 'Burn', 'Sets the player on fire every few ticks while a condition is met.'],
  exhaust: ['Survival', 'Drain hunger', 'Drains hunger every few ticks while a condition is met.'],
  disable_regen: ['Survival', 'No natural regeneration', 'The player does not heal from a full hunger bar.'],
  freeze: ['Survival', 'Freeze', 'Makes the player freeze like in powder snow.'],
  entity_group: [
    'Survival',
    'Mob group',
    'Makes the player count as undead, arthropod and so on (for enchantments like Smite).',
  ],

  // restrictions
  restrict_armor: ['Restrictions', 'Restrict armor', 'Stops the player from wearing certain armor.'],
  conditioned_restrict_armor: [
    'Restrictions',
    'Restrict armor when',
    'Stops the player from wearing certain armor while a condition is met.',
  ],
  prevent_item_use: ['Restrictions', 'Prevent using items', 'Stops the player from using certain items.'],
  prevent_block_use: ['Restrictions', 'Prevent using blocks', 'Stops the player from right-clicking certain blocks.'],
  prevent_block_place: ['Restrictions', 'Prevent placing blocks', 'Stops the player from placing blocks.'],
  prevent_block_selection: ['Restrictions', 'Prevent targeting blocks', 'The player cannot target certain blocks.'],
  prevent_entity_use: [
    'Restrictions',
    'Prevent using entities',
    'Stops the player from right-clicking certain entities.',
  ],
  prevent_being_used: ['Restrictions', 'Prevent being used', 'Stops other players from right-clicking this player.'],
  prevent_entity_collision: [
    'Restrictions',
    'No entity collision',
    'The player does not collide with certain entities.',
  ],
  prevent_item_pickup: ['Restrictions', 'Prevent picking up items', 'Stops the player from picking up certain items.'],
  prevent_sleep: ['Restrictions', 'Prevent sleeping', 'Stops the player from sleeping in beds.'],
  prevent_sprinting: ['Restrictions', 'Prevent sprinting', 'Stops the player from sprinting.'],
  prevent_elytra_flight: ['Restrictions', 'Prevent elytra flight', 'Stops the player from gliding with an elytra.'],
  prevent_game_event: [
    'Restrictions',
    'Prevent game events',
    'Stops the player from causing certain game events, like sculk vibrations.',
  ],

  // items
  edible_item: ['Items', 'Edible items', 'Makes items edible for the player.'],
  item_on_item: ['Items', 'Use item on item', 'Runs actions when one item is clicked onto another in the inventory.'],
  modify_crafting: ['Items', 'Change crafting results', 'Changes the result of a crafting recipe.'],
  modify_grindstone: ['Items', 'Change grindstone results', 'Changes what a grindstone produces.'],
  replace_loot_table: ['Items', 'Replace loot', 'Replaces loot tables with other ones.'],
  tooltip: ['Items', 'Item tooltip', 'Adds lines to item tooltips.'],

  // visual
  night_vision: ['Visual', 'Night vision', 'Lets the player see in the dark.'],
  toggle_night_vision: ['Visual', 'Toggle night vision', 'Night vision the player can turn on and off.'],
  invisibility: ['Visual', 'Invisibility', 'Makes the player invisible.'],
  model_color: ['Visual', 'Model color', "Tints the player's model."],
  overlay: ['Visual', 'Screen overlay', 'Draws a texture or effect over the screen.'],
  shader: ['Visual', 'Shader', "Applies a post-processing shader to the player's view."],
  particle: ['Visual', 'Particles', 'Spawns particles around the player.'],
  entity_glow: ['Visual', 'See entities glow', 'Makes other entities glow for the player.'],
  self_glow: ['Visual', 'Glow for others', 'Makes the player glow for other players.'],
  lava_vision: ['Visual', 'See in lava', 'Lets the player see further in lava.'],
  modify_camera_submersion: ['Visual', 'Camera submersion', 'Changes the underwater or in-lava view effect.'],
  modify_block_render: ['Visual', 'Render blocks as', 'Renders some blocks as other blocks for the player.'],
  modify_fluid_render: ['Visual', 'Render fluids as', 'Renders some fluids differently for the player.'],
  prevent_entity_render: ['Visual', 'Hide entities', 'Hides certain entities from the player.'],
  prevent_feature_render: ['Visual', 'Hide model parts', 'Hides parts of the player model like armor or the cape.'],
  shaking: ['Visual', 'Shaking', "Makes the player's model shake."],
  status_bar_texture: ['Visual', 'Status bar texture', 'Replaces the textures of the health and hunger bars.'],
}

const SHARED: Record<string, [label: string, description: string]> = {
  and: ['All of', 'Runs every action in order.'],
  chance: ['Random chance', 'Runs the action with a chance between 0 and 1.'],
  choice: ['Weighted choice', 'Picks one action at random using weights.'],
  delay: ['Delay', 'Waits a number of ticks, then runs the action.'],
  if_else: ['If / else', 'Runs one action if a condition is met, another if not.'],
  if_else_list: ['If / else if', 'Runs the first action whose condition is met.'],
  nothing: ['Nothing', 'Does nothing.'],
  side: ['Client or server only', 'Runs the action only on the client or only on the server.'],
}

const SHARED_CONDITIONS: Record<string, [label: string, description: string]> = {
  and: ['All of', 'True when every condition is true.'],
  or: ['Any of', 'True when at least one condition is true.'],
  constant: ['Always', 'Always true or always false.'],
  chance: ['Random chance', 'True with a chance between 0 and 1.'],
  in_tag: ['In tag', 'True when it is in a tag.'],
}

const ENTITY_ACTIONS: Record<string, [string, string]> = {
  action_on_set: ['Act on remembered entities', 'Runs a two-entity action on the entities in an entity set.'],
  add_to_set: ['Remember entity', 'Adds the target to an entity set.'],
  add_velocity: ['Push', 'Adds velocity in a direction.'],
  add_xp: ['Give experience', 'Gives experience points or levels.'],
  apply_effect: ['Give effect', 'Gives one or more status effects.'],
  area_of_effect: ['Area of effect', 'Runs a two-entity action on every entity in a radius.'],
  block_action_at: ['Block action here', "Runs a block action at the entity's position."],
  change_resource: ['Change resource', 'Adds to or sets a resource or cooldown power.'],
  clear_effect: ['Clear effects', 'Removes a status effect, or all of them.'],
  crafting_table: ['Open crafting table', 'Opens a crafting table screen.'],
  damage: ['Damage', 'Deals damage.'],
  dismount: ['Dismount', 'Stops riding.'],
  drop_inventory: ['Drop items', 'Drops items from the inventory.'],
  emit_game_event: ['Emit game event', 'Emits a game event, like a vibration.'],
  ender_chest: ['Open ender chest', 'Opens the ender chest.'],
  equipped_item_action: ['Act on equipped item', 'Runs an item action on an equipped item.'],
  execute_command: ['Run command', 'Runs a command as the entity.'],
  exhaust: ['Add exhaustion', 'Makes the player hungrier.'],
  explode: ['Explode', 'Creates an explosion.'],
  extinguish: ['Extinguish', 'Puts out fire.'],
  feed: ['Feed', 'Restores food and saturation.'],
  fire_projectile: ['Fire projectile', 'Shoots a projectile.'],
  gain_air: ['Gain air', 'Restores or removes breath.'],
  give: ['Give item', 'Gives an item stack.'],
  grant_advancement: ['Grant advancement', 'Grants an advancement or some of its criteria.'],
  grant_power: ['Grant power', 'Gives a power from a source.'],
  heal: ['Heal', 'Heals health.'],
  modify_death_ticks: ['Change death animation', 'Changes the death animation timer.'],
  modify_inventory: ['Act on inventory items', 'Runs an item action on items in the inventory.'],
  modify_resource: ['Modify resource', 'Changes a resource using modifiers.'],
  modify_stat: ['Change statistic', 'Changes a statistic value.'],
  passenger_action: ['Act on passengers', 'Runs actions on entities riding this one.'],
  play_sound: ['Play sound', 'Plays a sound.'],
  random_teleport: ['Random teleport', 'Teleports to a random safe spot nearby.'],
  raycast: ['Raycast', 'Looks in a direction and runs actions on what it hits.'],
  remove_power: ['Remove power', 'Removes a power from every source.'],
  replace_inventory: ['Replace inventory items', 'Replaces items in the inventory.'],
  revoke_advancement: ['Revoke advancement', 'Revokes an advancement or some of its criteria.'],
  revoke_all_powers: ['Revoke all powers', 'Removes every power from a source.'],
  revoke_power: ['Revoke power', 'Removes a power from a source.'],
  riding_action: ['Act on vehicle', 'Runs actions on the entity being ridden.'],
  selector_action: ['Act on selector', 'Runs a two-entity action on entities matching a target selector.'],
  set_fall_distance: ['Set fall distance', 'Sets how far the entity has fallen.'],
  set_on_fire: ['Set on fire', 'Sets the entity on fire for some seconds.'],
  set_resource: ['Set resource', 'Sets a resource to a value.'],
  spawn_effect_cloud: ['Spawn effect cloud', 'Spawns a lingering potion cloud.'],
  spawn_entity: ['Spawn entity', 'Spawns an entity.'],
  spawn_particles: ['Spawn particles', 'Spawns particles.'],
  swing_hand: ['Swing hand', 'Plays the hand swing animation.'],
  toggle: ['Toggle power', 'Turns a toggle power on or off.'],
  trigger_cooldown: ['Start cooldown', 'Starts the cooldown of a power.'],
}

const BIENTITY_ACTIONS: Record<string, [string, string]> = {
  actor_action: ['Act on actor', 'Runs an action on the actor.'],
  target_action: ['Act on target', 'Runs an action on the target.'],
  invert: ['Swap actor and target', 'Runs the action with actor and target swapped.'],
  mount: ['Mount', 'Makes the actor ride the target.'],
  set_in_love: ['Set in love', 'Makes the target ready to breed.'],
  tame: ['Tame', 'Makes the target tamed by the actor.'],
  remove_from_set: ['Forget entity', 'Removes the target from an entity set.'],
  add_velocity: ['Push', 'Pushes the target relative to the actor.'],
  damage: ['Damage', 'The actor damages the target.'],
  add_to_set: ['Remember entity', 'Adds the target to an entity set.'],
}

const BLOCK_ACTIONS: Record<string, [string, string]> = {
  add_block: ['Place block', 'Places a block.'],
  set_block: ['Set block', 'Replaces the block.'],
  area_of_effect: ['Area of effect', 'Runs a block action on every block in a radius.'],
  bonemeal: ['Bonemeal', 'Applies bonemeal.'],
  execute_command: ['Run command', 'Runs a command at the block.'],
  explode: ['Explode', 'Creates an explosion at the block.'],
  modify_block_state: ['Change block state', 'Changes a block state property.'],
  offset: ['Offset', 'Runs a block action at a block nearby.'],
  spawn_entity: ['Spawn entity', 'Spawns an entity at the block.'],
}

const ITEM_ACTIONS: Record<string, [string, string]> = {
  consume: ['Consume', 'Removes items from the stack.'],
  damage: ['Damage item', 'Uses up durability.'],
  holder_action: ['Act on holder', 'Runs an action on the entity holding the item.'],
  merge_nbt: ['Merge NBT', 'Merges NBT data into the item.'],
  modify: ['Modify item', 'Runs an item modifier.'],
  remove_enchantment: ['Remove enchantment', 'Removes enchantments from the item.'],
}

const ENTITY_CONDITIONS: Record<string, [string, string]> = {
  ability: ['Has ability', 'Checks a player ability like flying.'],
  advancement: ['Has advancement', 'True when the player has an advancement.'],
  air: ['Air', 'Compares remaining breath.'],
  attribute: ['Attribute', 'Compares an attribute value.'],
  biome: ['In biome', 'True in certain biomes.'],
  block_collision: ['Touching blocks', 'True when the entity would collide with blocks.'],
  block_in_radius: ['Blocks nearby', 'Counts matching blocks in a radius.'],
  brightness: ['Brightness', 'Compares the light level where the entity is.'],
  climbing: ['Climbing', 'True while climbing.'],
  collided_horizontally: ['Hitting a wall', 'True when moving into a wall.'],
  command: ['Command result', 'Compares the result of a command.'],
  creative_flying: ['Flying', 'True while flying in creative mode.'],
  daytime: ['Daytime', 'True during the day.'],
  dimension: ['In dimension', 'True in a dimension.'],
  distance_from_coordinates: ['Distance from point', 'Compares the distance from a point.'],
  distance_from_spawn: ['Distance from spawn', 'Compares the distance from world spawn.'],
  elytra_flight_possible: ['Can glide', 'True when the entity could start gliding.'],
  enchantment: ['Enchantment level', 'Compares an enchantment level on equipped items.'],
  entity_group: ['Mob group', 'True for undead, arthropods and so on.'],
  entity_type: ['Entity type', 'True for one kind of entity.'],
  equipped_item: ['Equipped item', 'Checks an item in an equipment slot.'],
  exists: ['Exists', 'True when there is an entity.'],
  exposed_to_sky: ['Under open sky', 'True when nothing is above.'],
  exposed_to_sun: ['In sunlight', 'True when in direct sunlight during the day.'],
  fall_distance: ['Fall distance', 'Compares how far the entity has fallen.'],
  fall_flying: ['Gliding', 'True while gliding with an elytra.'],
  fluid_height: ['Fluid height', 'Compares how deep the entity is in a fluid.'],
  food_level: ['Food level', 'Compares the hunger bar.'],
  gamemode: ['Game mode', 'True in a game mode.'],
  glowing: ['Glowing', 'True while glowing.'],
  health: ['Health', 'Compares health.'],
  in_block: ['Inside block', 'Checks the block the entity is in.'],
  in_block_anywhere: ['Touching block', 'Counts matching blocks the entity touches.'],
  in_rain: ['In rain', 'True when standing in rain.'],
  in_snow: ['In snow', 'True when standing in snowfall.'],
  in_tag: ['Entity tag', 'True for entity types in a tag.'],
  in_thunderstorm: ['In thunderstorm', 'True during a thunderstorm.'],
  inventory: ['Inventory items', 'Counts matching items in the inventory.'],
  invisible: ['Invisible', 'True while invisible.'],
  living: ['Living', 'True for living entities.'],
  moving: ['Moving', 'True while moving.'],
  nbt: ['NBT', "Checks the entity's NBT data."],
  on_block: ['Standing on block', 'Checks the block below.'],
  on_fire: ['On fire', 'True while burning.'],
  passenger: ['Passengers', 'Counts passengers.'],
  passenger_recursive: ['All passengers', 'Counts passengers, including passengers of passengers.'],
  power: ['Has power', 'True when the entity has a power.'],
  power_active: ['Power active', 'True when a power is active.'],
  power_type: ['Has power type', 'True when the entity has a power of a type.'],
  predicate: ['Predicate', 'Checks a vanilla predicate.'],
  raycast: ['Looking at', 'Checks what the entity is looking at.'],
  relative_health: ['Health percent', 'Compares health as a fraction of max health.'],
  resource: ['Resource value', 'Compares a resource or cooldown power.'],
  riding: ['Riding', 'Checks the entity being ridden.'],
  riding_recursive: ['Riding (any level)', 'Counts vehicles below the entity.'],
  riding_root: ['Bottom vehicle', 'Checks the lowest vehicle.'],
  saturation_level: ['Saturation', 'Compares saturation.'],
  scoreboard: ['Scoreboard', 'Compares a scoreboard value.'],
  set_size: ['Entity set size', 'Compares how many entities are in a set.'],
  sneaking: ['Sneaking', 'True while sneaking.'],
  sprinting: ['Sprinting', 'True while sprinting.'],
  status_effect: ['Has effect', 'True with a status effect.'],
  submerged_in: ['Underwater', 'True when the eyes are in a fluid.'],
  swimming: ['Swimming', 'True while swimming.'],
  tamed: ['Tamed', 'True for tamed animals.'],
  time_of_day: ['Time of day', 'Compares the time of day.'],
  using_effective_tool: ['Using right tool', 'True when mining with the right tool.'],
  using_item: ['Using item', 'True while using an item.'],
  xp_levels: ['Experience levels', 'Compares experience levels.'],
  xp_points: ['Experience points', 'Compares experience points.'],
  origin: ['Has origin', 'True when the player has an origin.'],
}

const BIENTITY_CONDITIONS: Record<string, [string, string]> = {
  actor_condition: ['Actor', 'Checks the actor.'],
  target_condition: ['Target', 'Checks the target.'],
  both: ['Both', 'True when actor and target both match.'],
  either: ['Either', 'True when actor or target matches.'],
  invert: ['Swap', 'Checks with actor and target swapped.'],
  undirected: ['Either way', 'True in either direction.'],
  attack_target: ['Attack target', 'True when the target is what the actor is attacking.'],
  attacker: ['Attacker', 'True when the target attacked the actor last.'],
  can_see: ['Can see', 'True when the actor can see the target.'],
  distance: ['Distance', 'Compares the distance between them.'],
  equal: ['Same entity', 'True when actor and target are the same.'],
  in_set: ['In entity set', "True when the target is in the actor's entity set."],
  owner: ['Owner', 'True when the target owns the actor.'],
  relative_rotation: ['Facing', 'Compares the angle between them.'],
  riding: ['Riding', 'True when the actor rides the target.'],
  riding_recursive: ['Riding (any level)', 'True when the actor rides the target, at any level.'],
  riding_root: ['Bottom vehicle', "True when the target is the actor's lowest vehicle."],
}

const BLOCK_CONDITIONS: Record<string, [string, string]> = {
  adjacent: ['Neighbours', 'Counts matching neighbouring blocks.'],
  attachable: ['Attachable', 'True when something could attach to it.'],
  blast_resistance: ['Blast resistance', 'Compares blast resistance.'],
  block: ['Block', 'True for one block.'],
  block_entity: ['Has block entity', 'True for blocks like chests.'],
  block_state: ['Block state', 'Checks a block state property.'],
  command: ['Command result', 'Compares the result of a command run at the block.'],
  distance_from_coordinates: ['Distance from point', 'Compares the distance from a point.'],
  distance_from_spawn: ['Distance from spawn', 'Compares the distance from world spawn.'],
  exposed_to_sky: ['Under open sky', 'True when nothing is above.'],
  fluid: ['Fluid', 'Checks the fluid in the block.'],
  hardness: ['Hardness', 'Compares hardness.'],
  height: ['Height', 'Compares the Y level.'],
  light_blocking: ['Blocks light', 'True for blocks that block light.'],
  light_level: ['Light level', 'Compares the light level.'],
  material: ['Material', 'Old material check, mapped to tags.'],
  movement_blocking: ['Solid', "True for blocks you can't walk through."],
  nbt: ['NBT', 'Checks block entity NBT.'],
  offset: ['Offset', 'Checks a block nearby.'],
  replacable: ['Replaceable', 'True for blocks like grass that can be replaced.'],
  slipperiness: ['Slipperiness', 'Compares slipperiness.'],
  water_loggable: ['Waterloggable', 'True for blocks that can hold water.'],
}

const ITEM_CONDITIONS: Record<string, [string, string]> = {
  amount: ['Stack size', 'Compares the stack size.'],
  armor_value: ['Armor value', 'Compares the armor value.'],
  damageable: ['Has durability', 'True for items with durability.'],
  durability: ['Durability', 'Compares the remaining durability.'],
  empty: ['Empty', 'True for an empty slot.'],
  enchantable: ['Enchantable', 'True for enchantable items.'],
  enchantment: ['Enchantment level', 'Compares an enchantment level.'],
  equippable: ['Equippable', 'True for items worn in a slot.'],
  fireproof: ['Fireproof', "True for items that don't burn."],
  food: ['Food', 'True for food.'],
  fuel: ['Fuel', 'Compares the furnace burn time.'],
  harvest_level: ['Harvest level', 'Compares the tool tier.'],
  has_power: ['Has power', 'True when the item grants a power.'],
  ingredient: ['Matches item', 'True when it matches an item or tag.'],
  meat: ['Meat', 'True for meat.'],
  nbt: ['NBT', 'Checks item NBT.'],
  power_count: ['Power count', 'Counts the powers the item grants.'],
  relative_durability: ['Durability percent', 'Compares durability as a fraction.'],
  smeltable: ['Smeltable', 'True for items that can be smelted.'],
}

const DAMAGE_CONDITIONS: Record<string, [string, string]> = {
  amount: ['Amount', 'Compares the damage amount.'],
  attacker: ['Attacker', 'Checks who caused the damage.'],
  bypasses_armor: ['Ignores armor', 'True for damage that ignores armor.'],
  explosive: ['Explosion', 'True for explosion damage.'],
  fire: ['Fire', 'True for fire damage.'],
  from_falling: ['Falling', 'True for fall damage.'],
  in_tag: ['Damage tag', 'True for damage types in a tag.'],
  name: ['Name', 'Checks the damage source name.'],
  out_of_world: ['Void', 'True for void damage.'],
  projectile: ['Projectile', 'True for projectile damage.'],
  type: ['Damage type', 'True for one damage type.'],
  unblockable: ['Unblockable', "True for damage shields can't block."],
}

const FLUID_CONDITIONS: Record<string, [string, string]> = {
  empty: ['Empty', 'True when there is no fluid.'],
  fluid: ['Fluid', 'True for one fluid.'],
  still: ['Source', 'True for source blocks.'],
}

const BIOME_CONDITIONS: Record<string, [string, string]> = {
  category: ['Category', 'Old biome category check.'],
  high_humidity: ['Humid', 'True for humid biomes.'],
  precipitation: ['Weather', 'Checks rain or snow.'],
  temperature: ['Temperature', 'Compares the temperature.'],
}

const PER_CATEGORY: Partial<Record<Category, Record<string, [string, string]>>> = {
  entity_action: ENTITY_ACTIONS,
  bientity_action: BIENTITY_ACTIONS,
  block_action: BLOCK_ACTIONS,
  item_action: ITEM_ACTIONS,
  entity_condition: ENTITY_CONDITIONS,
  bientity_condition: BIENTITY_CONDITIONS,
  block_condition: BLOCK_CONDITIONS,
  item_condition: ITEM_CONDITIONS,
  damage_condition: DAMAGE_CONDITIONS,
  fluid_condition: FLUID_CONDITIONS,
  biome_condition: BIOME_CONDITIONS,
}

export function humanize(path: string) {
  const s = path.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function describe(category: Category, id: string): TypeInfo {
  const path = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id
  if (category === 'power_type') {
    // origins: has its own callback power with an extra "chosen" action, keep the two apart in the picker
    if (id === 'origins:action_on_callback')
      return {
        group: 'Triggers',
        label: 'On choosing this origin',
        description: 'Like "On gain, loss or respawn", plus an action that runs when the player picks this origin.',
      }
    const e = POWER_TYPES[path]
    if (e) return { group: e[0], label: e[1], description: e[2] }
    return { group: 'Other', label: humanize(path), description: '' }
  }
  const own = PER_CATEGORY[category]?.[path]
  const shared = category.endsWith('_action') ? SHARED[path] : SHARED_CONDITIONS[path]
  const hit = own ?? shared
  const group = shared && !own ? 'Logic' : 'General'
  if (hit) return { group, label: hit[0], description: hit[1] }
  return { group: 'General', label: humanize(path), description: '' }
}
