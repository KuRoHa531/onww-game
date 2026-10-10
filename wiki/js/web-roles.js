/**
 * web-roles.js
 * ------------------------------------------------------------
 * 「ウェブ版」(オンライン版ゲーム)に実装されている役職の一覧。
 * wiki-data.js の key と同じ値(大文字)で、wiki の order の順(=実装した順)に並べる。
 *
 * ※ ゲーム内オーバーレイとして開かれている時は、ゲーム本体の
 *    ONW.ROLE_INFO から自動で取得するので、この一覧は使われない。
 *    これは「ワンナイト人狼ガイド(全役職)を単体で公開している時」用の予備。
 *    ゲームに役職を追加したら、ここにも同じ key を足すこと。
 * ------------------------------------------------------------
 */
window.ONW_WEB_ROLE_KEYS = [
  "LIGHT_APOSTLE", "VILLAGER", "SEER", "ROBBER", "RELIC_ROBBER", "TROUBLEMAKER", "INSOMNIAC", "MASON",
  "STRAW_DOLL", "CAT_SIDHE", "MERLIN", "WOLF_DREAMER", "WOLF_MARKED", "BAKER", "STAR", "CHICKEN",
  "NEWSPAPER", "MAYOR", "VISITOR", "QUEEN", "TOUGH_GUY", "FOX_MARKED", "KEYMASTER", "DICTATOR",
  "EXCHANGER", "WATCHDOG", "SHERIFF", "DARK_AVATAR", "WEREWOLF", "BIG_WOLF", "LONE_WOLF", "WHITE_WOLF",
  "TOFU_WOLF", "FORGETFUL_WOLF", "ASSASSIN", "WOLF_KING", "MAPO_WOLF", "CAT_PUMPKIN", "OBSERVER_WOLF", "MADMAN",
  "MAD_SEER", "CULTIST", "BLACK_CAT", "EXPOSED_MADMAN", "MUZZLE_MADMAN", "SILVER_SHADOW", "TANNER", "LOVE_TANNER",
  "GOD", "OPPORTUNIST", "AMANOJAKU", "FREETER", "SERVANT", "WINNER", "LOSER", "DOPPELGANGER",
  "SCHRODINGER_CAT", "EXECUTIONER", "GREMLIN", "PURE_LOVER", "EVIL_WOMAN", "CUPID", "HEARTBREAKER", "SHUFFLER",
  "BOUNTY_HUNTER", "FOX", "FANATIC",
];
