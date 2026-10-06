/**
 * web-roles.js
 * ------------------------------------------------------------
 * 「ウェブ版」(オンライン版ゲーム)に実装されている役職の一覧。
 * wiki-data.js の key と同じ値(大文字)で並べる。
 *
 * ※ ゲーム内オーバーレイとして開かれている時は、ゲーム本体の
 *    ONW.ROLE_INFO から自動で取得するので、この一覧は使われない。
 *    これは「ワンナイト人狼ガイド(全役職)を単体で公開している時」用の予備。
 *    ゲームに役職を追加したら、ここにも同じ key を足すこと。
 * ------------------------------------------------------------
 */
window.ONW_WEB_ROLE_KEYS = [
  "WEREWOLF", "BIG_WOLF", "LONE_WOLF", "WHITE_WOLF", "TOFU_WOLF", "FORGETFUL_WOLF", "ASSASSIN", "CULTIST", "MADMAN", "MAD_SEER",
  "DARK_AVATAR", "LIGHT_APOSTLE", "SILVER_SHADOW",
  "VILLAGER", "SEER", "ROBBER", "RELIC_ROBBER", "TROUBLEMAKER", "INSOMNIAC", "MASON", "MERLIN", "WOLF_DREAMER", "WOLF_MARKED", "BAKER", "STAR", "NEWSPAPER", "CHICKEN", "MAYOR", "VISITOR",
  "TANNER", "LOVE_TANNER", "GOD", "OPPORTUNIST", "FREETER", "SERVANT", "WINNER", "LOSER", "DOPPELGANGER", "EXECUTIONER", "GREMLIN",
  "STRAW_DOLL", "CAT_SIDHE", "BLACK_CAT", "AMANOJAKU",
];
