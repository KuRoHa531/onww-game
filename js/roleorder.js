/**
 * roleorder.js
 * ------------------------------------------------------------
 * 役職の「唯一の並び順」。wiki(wiki/js/wiki-data.js)の order の昇順(=実装した順)を役職IDで並べたもの。
 * 変化先・変化公開・COボタン・ロビー・ガイド・デバッグなど、役職を並べる場所はすべてこの順に揃える。
 *
 * 【役職を追加するとき】この配列の末尾に役職IDを1つ足す(wiki-data.js の order も同じ並びで末尾に足す)。
 *   ※ 例外は wiki 側で確認済みの2か所(サムはホタルの直後 / 狂ったドーナツ屋は狂った煽動者の直後)。もう揃っている。
 * 酔っ払い(drunk)・恋人(lover)のように wiki に載らない共通の役職は、配列に無いので「どの並びでも末尾」になる。
 * 勝敗や乱数には関わらない(並べ替えのためだけの表)。
 * ------------------------------------------------------------ */
(function (ONW) {
  "use strict";
  ONW.ROLE_ORDER = [
    "light_apostle", "villager", "seer", "robber", "relic_robber", "troublemaker", "insomniac", "mason",
    "straw_doll", "cat_sidhe", "merlin", "wolf_dreamer", "wolf_marked", "baker", "star", "chicken",
    "newspaper", "mayor", "visitor", "queen", "tough_guy", "fox_marked", "keymaster", "dictator",
    "exchanger", "penguin", "watchdog", "sheriff", "cursed_one", "thief", "sense_seer", "princess",
    "libra", "fake_seer", "poet", "spy", "cosplayer", "major", "finger_reader", "gambler",
    "priest", "fairy", "aa", "goranshin", "steve", "icarus", "election_manager", "moses",
    "yomi", "carmen", "knight", "trailblazer", "hokma", "bartender", "psychologist", "clone",
    "whimsical_seer", "medium", "apprentice_seer", "lookout", "agitator", "bell_miko", "donut_shop", "hayatochiri",
    "screw_gum", "hunter", "necromancer", "counselor", "ren", "trap_master", "dark_avatar", "werewolf",
    "big_wolf", "lone_wolf", "white_wolf", "tofu_wolf", "forgetful_wolf", "assassin", "wolf_king", "mapo_wolf",
    "cat_pumpkin", "observer_wolf", "mind_wolf", "mimic_wolf", "eraser_wolf", "mirage_wolf", "silver_wolf", "command_wolf",
    "curse_wolf", "negi_wolf", "patch", "madman", "mad_seer", "cultist", "black_cat", "exposed_madman",
    "muzzle_madman", "rebel_madman", "mad_queen", "black_wolf_madman", "mad_mayor", "seal_madman", "mad_exchanger", "tenacious_madman",
    "jester_madman", "smoke_madman", "mad_priest", "rat_madman", "ox_madman", "tiger_madman", "rabbit_madman", "dragon_madman",
    "snake_madman", "horse_madman", "sheep_madman", "monkey_madman", "rooster_madman", "dog_madman", "boar_madman", "mad_agitator",
    "crazy_donut_shop", "silver_shadow", "tanner", "love_tanner", "god", "opportunist", "amanojaku", "freeter",
    "servant", "winner", "loser", "wraith", "doppelganger", "schrodinger_cat", "executioner", "gremlin",
    "pure_lover", "evil_woman", "cupid", "heartbreaker", "shuffler", "bounty_hunter", "fox", "fanatic",
    "balancer", "avenger", "prankster", "jester_bomber", "detective", "demon_duke", "martyr", "predictor",
    "reverser", "lawyer", "watcher", "vanity", "beggar", "magical_girl", "matthias", "daughter",
    "yokai_tanuki", "chesed", "nanoka", "mitsuki_nanoka", "long_night_moon", "rasetsu", "agent", "elfrinde",
    "hotaru", "sam", "mercenary", "thread_spinner", "magician", "wagerer", "persona", "multi_personality",
    "odd_one", "even_one", "jester_ghost", "telepathist", "copyist", "detective_ghost",
  ];
  const rank = new Map(); ONW.ROLE_ORDER.forEach((id, i) => rank.set(id, i));
  // 役職IDの並び順の番号(wiki に無い役職は大きい数=末尾)
  ONW.roleRank = (id) => (rank.has(id) ? rank.get(id) : 1e6);
  // 役職IDの配列を基準の順に並べ替えた新しい配列(同じ順位=wikiに無い役職どうしは元の順のまま)
  ONW.sortByRoleOrder = (ids) => ids.map((id, i) => ({ id, i })).sort((a, b) => ONW.roleRank(a.id) - ONW.roleRank(b.id) || a.i - b.i).map((x) => x.id);
})(window.ONW);
