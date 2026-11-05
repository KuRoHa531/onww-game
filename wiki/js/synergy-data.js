/**
 * synergy-data.js — 闇鍋シナジーの一覧（wiki/synergy.html 用の控え）。
 * 元データは ゲーム本体の js/roles.js の ONW.SYNERGY_RULES（＋自認村人の自動ルール）/ ONW.SYNERGY_COUNT_RULES を機械的に書き出したもの。
 * ゲーム内（?embed=1 で開かれている時）は synergy.js がゲーム本体の最新のルールを直接読むので、この控えは単体公開用。
 * 役職を足したりシナジーを変えたら、js/roles.js と一緒にここも直すこと（notes / countNotes は説明文。キーは trigger の役職ID / ルールの label）。
 */
window.ONW_WIKI_SYNERGY = {
 "rules": [
  {
   "trigger": "white_wolf",
   "required": [
    "villager",
    "seer"
   ],
   "priority": []
  },
  {
   "trigger": "forgetful_wolf",
   "required": [
    "villager"
   ],
   "priority": [
    "villager"
   ]
  },
  {
   "trigger": "assassin",
   "required": [
    "merlin"
   ],
   "priority": []
  },
  {
   "trigger": "merlin",
   "required": [
    "assassin"
   ],
   "priority": [
    "assassin"
   ]
  },
  {
   "trigger": "wolf_dreamer",
   "required": [
    "werewolf"
   ],
   "priority": []
  },
  {
   "trigger": "wolf_marked",
   "required": [
    "villager",
    "werewolf"
   ],
   "priority": [
    "villager"
   ]
  },
  {
   "trigger": "mapo_wolf",
   "required": [
    "tofu_wolf"
   ],
   "priority": []
  },
  {
   "trigger": "fake_seer",
   "required": [
    "seer"
   ],
   "priority": []
  },
  {
   "trigger": "mirage_wolf",
   "required": [
    "seer"
   ],
   "priority": []
  },
  {
   "trigger": "rebel_madman",
   "required": [
    "dictator"
   ],
   "priority": []
  },
  {
   "trigger": "black_wolf_madman",
   "required": [
    "werewolf",
    "seer"
   ],
   "priority": []
  },
  {
   "trigger": "mad_queen",
   "required": [
    "queen"
   ],
   "priority": []
  },
  {
   "trigger": "fox",
   "required": [
    "seer"
   ],
   "priority": []
  },
  {
   "trigger": "fox_marked",
   "required": [
    "seer",
    "fox",
    "villager"
   ],
   "priority": [
    "villager"
   ]
  },
  {
   "trigger": "fanatic",
   "required": [
    "fox",
    "seer"
   ],
   "priority": []
  },
  {
   "trigger": "princess",
   "required": [
    "villager",
    "queen"
   ],
   "priority": [
    "villager"
   ]
  },
  {
   "trigger": "mason",
   "required": [
    "mason",
    "mason"
   ],
   "priority": []
  },
  {
   "trigger": "cursed_one",
   "required": [
    "villager"
   ],
   "priority": [
    "villager"
   ]
  }
 ],
 "counts": [
  {
   "trigger": "insomniac",
   "always": false,
   "label": "役職を変える役職",
   "anyOf": [
    "robber",
    "troublemaker",
    "gremlin",
    "doppelganger",
    "shuffler"
   ],
   "min": 2,
   "max": 2,
   "force": false,
   "early": false,
   "unlessLover": false
  },
  {
   "trigger": "keymaster",
   "always": false,
   "label": "ロック対象の役職変化系",
   "anyOf": [
    "robber",
    "troublemaker",
    "relic_robber",
    "doppelganger",
    "shuffler",
    "gremlin"
   ],
   "min": 2,
   "max": null,
   "force": false,
   "early": false,
   "unlessLover": false
  },
 {
  "trigger": "poet",
  "always": false,
  "label": "詩人が見られる役職",
  "anyOf": [
   "seer",
   "robber",
   "troublemaker",
   "visitor",
   "keymaster",
   "watchdog",
   "fake_seer",
   "eraser_wolf",
   "mad_seer",
   "exposed_madman",
   "seal_madman",
   "love_tanner",
   "freeter",
   "doppelganger",
   "gremlin",
   "pure_lover",
   "evil_woman",
   "cupid",
   "heartbreaker",
   "shuffler",
   "avenger",
   "prankster",
   "reverser"
   ],
  "min": 2,
  "max": null,
  "force": false,
  "early": false,
  "unlessLover": false
 },
 {
  "trigger": "observer_wolf",
  "always": false,
  "label": "観測の人狼が見られる役職",
  "anyOf": [
   "seer",
   "robber",
   "relic_robber",
   "troublemaker",
   "visitor",
   "keymaster",
   "watchdog",
   "fake_seer",
   "eraser_wolf",
   "mad_seer",
   "exposed_madman",
   "seal_madman",
   "love_tanner",
   "freeter",
   "doppelganger",
   "gremlin",
   "pure_lover",
   "evil_woman",
   "cupid",
   "heartbreaker",
   "shuffler",
   "avenger",
   "prankster",
   "reverser"
   ],
  "min": 2,
  "max": null,
  "force": false,
  "early": false,
  "unlessLover": false
 },
  {
   "trigger": "heartbreaker",
   "always": false,
   "label": "恋人系役職",
   "anyOf": [
    "evil_woman",
    "pure_lover",
    "cupid"
   ],
   "min": 1,
   "max": null,
   "force": false,
   "early": false,
   "unlessLover": true
  },
  {
   "trigger": "mapo_wolf",
   "always": false,
   "label": "麻婆対抗役",
   "anyOf": [
    "mayor",
    "watchdog",
    "sheriff",
    "exchanger",
    "dictator"
   ],
   "min": 1,
   "max": null,
   "force": true,
   "early": false,
   "unlessLover": false
  },
  {
   "trigger": "seal_madman",
   "always": false,
   "label": "封印作用のある役職",
   "anyOf": [
   "seer",
   "robber",
   "relic_robber",
   "troublemaker",
   "insomniac",
   "cat_sidhe",
   "baker",
   "chicken",
   "newspaper",
   "mayor",
   "visitor",
   "queen",
   "tough_guy",
   "keymaster",
   "dictator",
   "exchanger",
   "watchdog",
   "sheriff",
   "thief",
   "sense_seer",
   "libra",
   "fake_seer",
   "poet",
   "assassin",
   "wolf_king",
   "mapo_wolf",
   "cat_pumpkin",
   "observer_wolf",
   "mind_wolf",
   "mimic_wolf",
   "eraser_wolf",
   "mad_seer",
   "black_cat",
   "exposed_madman",
   "mad_queen",
   "mad_mayor",
   "mad_exchanger",
   "tenacious_madman",
   "jester_madman",
   "love_tanner",
   "freeter",
   "doppelganger",
   "gremlin",
   "pure_lover",
   "evil_woman",
   "cupid",
   "heartbreaker",
   "shuffler",
   "avenger",
   "prankster",
   "demon_duke",
    "predictor",
    "reverser",
    "lawyer"
   ],
   "min": 3,
   "max": null,
   "force": false,
   "early": false,
   "unlessLover": false
  },
  {
   "trigger": null,
   "always": true,
   "label": "悪女・純愛者・キューピッド",
   "anyOf": [
    "evil_woman",
    "pure_lover",
    "cupid"
   ],
   "min": 0,
   "max": 1,
   "force": false,
   "early": false,
   "unlessLover": false
  },
  {
   "trigger": null,
   "always": true,
   "label": "マーリン",
   "anyOf": [
    "merlin"
   ],
   "min": 0,
   "max": 1,
   "force": false,
   "early": true,
   "unlessLover": false
  }
 ],
 "notes": {
  "white_wolf": "白狼が出る闇鍋には、村人と占い師も最低1枚ずつ出す。",
  "forgetful_wolf": "自分を村人だと思い込む役職が出るときは、本物の村人も最低1枚出す。",
  "assassin": "アサシンが出る闇鍋には、狙う相手のマーリンも最低1枚出す。",
  "merlin": "マーリンが出る闇鍋には、狙うアサシンも最低1枚出す（アサシン↔マーリンの相互シナジー）。",
  "wolf_dreamer": "狼夢人が出る闇鍋には、人狼も最低1枚出す。",
  "wolf_marked": "狼憑きが出る闇鍋には、村人と人狼も最低1枚ずつ出す。",
  "mapo_wolf": "麻婆の人狼が出る闇鍋には、豆腐の人狼も必ず出す（豆腐の人狼がいても麻婆が必ず出るわけではない）。",
  "fake_seer": "偽占い師が出る闇鍋には、占い師も最低1枚出す（偽占い師の結果は、本物の占い師と見比べて初めて意味が出る）。",
  "mirage_wolf": "蜃気狼が出る闇鍋には、占い師も最低1枚出す（占われてランダムな役職に見えるのが活きる盤面）。",
  "rebel_madman": "反逆の狂人が出る闇鍋には、独裁者も最低1枚出す（クーデターの相手がいないと活きない）。",
  "black_wolf_madman": "黒子の狂人が出る闇鍋には、人狼と占い師も最低1枚ずつ出す（占われて「人狼」と出るのが活きる盤面）。",
  "mad_queen": "狂った女王が出る闇鍋には、女王も最低1枚出す（「女王」と通知される村人陣営の相手が必要）。",
  "fox": "妖狐が出る闇鍋には、占い師も最低1枚出す（妖狐は占われて呪殺されるため）。",
  "fox_marked": "狐憑きが出る闇鍋には、占い師・妖狐・村人も最低1枚ずつ出す。",
  "fanatic": "背徳者が出る闇鍋には、ご主人の妖狐と占い師も最低1枚ずつ出す（妖狐を呪殺できる占い師がいる盤面にする）。",
  "princess": "姫君が出る闇鍋には、村人と女王も最低1枚ずつ出す。",
  "mason": "共有者が出る闇鍋には、共有者を合わせて最低2枚出す（共有者が1人だけにならない）。",
  "cursed_one": "自分を村人だと思い込む役職として、本物の村人も最低1枚出す（自動で付くルール）。"
 },
 "countNotes": {
  "役職を変える役職": "後覚者は「最終的な役職」を知る役職なので、役職を動かす役職がちょうど2枚出る（合計2枚以上・2枚まで）。",
  "詩人が見られる役職": "詩人が出る闇鍋には、詩人の通知に出る役職（夜に対象を選ぶ能力を使う役職。墓地だけを対象にする墓荒らしは除く）を合わせて最低2枚出す。",
  "観測の人狼が見られる役職": "観測の人狼が出る闇鍋には、観測結果に出る役職（夜や朝のうちに対象を選ぶ能力を使う役職。墓地だけを対象にする墓荒らしも含む）を合わせて最低2枚出す。",
  "ロック対象の役職変化系": "鍵師が出る闇鍋には、ロックの対象になる役職変化系を合わせて最低2枚出す。",
  "恋人系役職": "破局師が出る闇鍋には、壊す相手の恋人を作る役職を最低1枚出す。恋人（重複役職）が最初から配られているときは足さない。",
  "麻婆対抗役": "麻婆豆腐（豆腐の人狼の3票）に対抗できる役職を、現世でも墓地でもよいので最低1枚出す。",
  "封印作用のある役職": "封印の狂人が出る闇鍋には、封印の効果を受ける役職を最低3枚出す。",
  "悪女・純愛者・キューピッド": "常に適用: この3役職は合わせて1人まで（変化から出た分だけ減らす）。",
  "マーリン": "常に適用: マーリンは1人まで（変化から2人目以降が出たときは、変化した枠を別の役職に変え直す。最初から配役に入れた分・デバッグ固定は動かさない）。"
 }
};
