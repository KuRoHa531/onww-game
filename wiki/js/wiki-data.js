/**
 * wiki-data.js
 * ------------------------------------------------------------
 * 役職事典(wiki.html)が参照する役職データ。
 * アドオン(scripts/state.js, scripts/utils.js)から機械的に転記。
 * achievements: 各役職に紐づく実績一覧(アドオン scripts/stats.js の
 * ACHIEVEMENTS を subCategory(=役職の表示名)でグルーピングして転記)。
 * id は実績の内部ID、name は実績名、desc は獲得条件。
 * kana: 五十音順ソート用の読み方(ひらがな)。漢字を含む役職はユーザー提供の
 * 読み方を使用し、それ以外はname自体をそのまま使用。
 * ------------------------------------------------------------
 */
window.ONW_WIKI_ROLES = [
  {
    "key": "AA",
    "id": "aa",
    "name": "A.A.",
    "team": "village",
    "order": 43,
    "desc": "役職変化系能力の対象になっても変化しません。ただし鍵師にロックされている場合は、逆に役職変化が成功するようになります。",
    "achievements": [
      {
        "id": "first_aa",
        "name": "えーちゃん",
        "desc": "初めてA.A.になる。"
      },
      {
        "id": "aa_win",
        "name": "錆鉄の魔女",
        "desc": "A.A.で勝利する。"
      },
      {
        "id": "aa_loss",
        "name": "全て錆びてしまうなら",
        "desc": "A.A.で敗北する。"
      },
      {
        "id": "aa_locked_win",
        "name": "錆鉄の空",
        "desc": "鍵師にロックされたA.A.で勝利する。"
      }
    ],
    "kana": "えーえー"
  },
  {
    "key": "ICARUS",
    "id": "icarus",
    "name": "イカロス",
    "team": "village",
    "order": 46,
    "desc": "昼能力で自分以外の複数のプレイヤーへ1回ずつ票を分け与えます。村人陣営には1票、人狼陣営・第三陣営・恋人・シャッフラー・反転状態のプレイヤーには2票を追加します。対象や票数は誰にも公開されません。",
    "achievements": [
      {
        "id": "first_icarus",
        "name": "太陽へ翔ぶ者",
        "desc": "初めてイカロスになる。"
      },
      {
        "id": "win_icarus",
        "name": "自由な飛翔",
        "desc": "イカロスで勝利する。"
      },
      {
        "id": "lose_icarus",
        "name": "バラバラの羽",
        "desc": "イカロスで敗北する。"
      },
      {
        "id": "icarus_give_village",
        "name": "希望の翼",
        "desc": "イカロスで村人陣営のプレイヤーに票を分け与える。"
      },
      {
        "id": "icarus_give_outsider",
        "name": "太陽に近づきすぎた",
        "desc": "イカロスで人外扱いのプレイヤーに票を分け与える。"
      }
    ],
    "kana": "イカロス"
  },
  {
    "key": "TROUBLEMAKER",
    "id": "troublemaker",
    "name": "いたずらっ子",
    "team": "village",
    "order": 6,
    "desc": "自分以外2人の役職を入れ替えます。",
    "achievements": [
      {
        "id": "trouble_village_village",
        "name": "村の中のいたずら",
        "desc": "いたずらっ子で村人陣営と村人陣営を入れ替える。"
      },
      {
        "id": "trouble_village_nonvillage",
        "name": "村と人外の入れ替え",
        "desc": "いたずらっ子で村人陣営と人外役を入れ替える。"
      },
      {
        "id": "trouble_nonvillage_nonvillage",
        "name": "人外同士のいたずら",
        "desc": "いたずらっ子で人外役と人外役を入れ替える。"
      },
      {
        "id": "trouble_became_trouble",
        "name": "いたずら返し",
        "desc": "いたずらっ子自身がいたずらっ子に入れ替えられる。"
      },
      {
        "id": "first_troublemaker",
        "name": "真夜中のいたずら",
        "desc": "初めていたずらっ子になる。"
      },
      {
        "id": "win_troublemaker",
        "name": "入れ替え大成功",
        "desc": "いたずらっ子で勝利する。"
      },
      {
        "id": "trouble_cleanup",
        "name": "いたずらの後始末",
        "desc": "交換した2人のうち、人狼陣営になったプレイヤーだけが追放される。"
      },
      {
        "id": "trouble_swap_sides",
        "name": "敵味方総入れ替え",
        "desc": "村人陣営と人狼陣営の役職を交換する。"
      }
    ],
    "kana": "いたずらっこ"
  },
  {
    "key": "CARMEN",
    "id": "carmen",
    "name": "カルメン",
    "team": "village",
    "order": 50,
    "desc": "夜にプレイヤー1人へ囁きます。対象が村人陣営なら、夜能力または昼能力をもう1回使えるようにします。対象が村人陣営以外なら、対象にカルメンが誰か知られてしまいます。",
    "achievements": [
      {
        "id": "carmen_loss",
        "name": "都市の病",
        "desc": "カルメンで敗北する。"
      },
      {
        "id": "carmen_outsider_whisper_loss",
        "name": "クソリプおばさん",
        "desc": "カルメンで村人陣営以外へ囁き、敗北する。"
      },
      {
        "id": "first_carmen",
        "name": "日光浴",
        "desc": "初めてカルメンになる。"
      },
      {
        "id": "win_carmen",
        "name": "E.G.Oを開花させる声",
        "desc": "カルメンで勝利する。"
      }
    ],
    "kana": "カルメン"
  },
  {
    "key": "GAMBLER",
    "id": "gambler",
    "name": "ギャンブラー",
    "team": "village",
    "order": 40,
    "desc": "自身の投票数が試合ごとに0〜3票へ変化し、自分の票数は分かりません。",
    "achievements": [
      {
        "id": "first_gambler",
        "name": "ちょっとだけパチ打ってくる",
        "desc": "初めてギャンブラーになる。"
      },
      {
        "id": "gambler_win",
        "name": "パチンカス",
        "desc": "ギャンブラーで勝利する。"
      },
      {
        "id": "gambler_loss",
        "name": "ギャンブル中毒",
        "desc": "ギャンブラーで敗北する。"
      },
      {
        "id": "gambler_three_votes",
        "name": "ジャックポット",
        "desc": "ギャンブラーで3票を持つ。"
      },
      {
        "id": "gambler_zero_votes",
        "name": "借金すれば大丈夫",
        "desc": "ギャンブラーで0票を持つ。"
      }
    ],
    "kana": "ギャンブラー"
  },
  {
    "key": "CLONE",
    "id": "clone",
    "name": "クローン",
    "team": "village",
    "order": 56,
    "desc": "配役時点で現世にいる村人陣営の役職を思い込みます。現世に思い込める村人役職がいなかった場合村人と思い込みます。実際の役職はクローンですが、思い込んだ役職の能力や通知を使用できます。占い結果はクローンです。",
    "achievements": [
      {
        "id": "clone_vote_original",
        "name": "本物は僕だっ…！",
        "desc": "クローンで思い込んでいる役職のプレイヤーに投票する。"
      },
      {
        "id": "first_clone",
        "name": "遺伝子複製",
        "desc": "初めてクローンになる。"
      },
      {
        "id": "win_clone",
        "name": "完全なる複製",
        "desc": "クローンで勝利する。"
      }
    ],
    "kana": "クローン"
  },
  {
    "key": "COSPLAYER",
    "id": "cosplayer",
    "name": "コスプレイヤー",
    "team": "village",
    "order": 37,
    "desc": "夜時間に提示された村人役職から1つ選び、その役職になります。村人、スパイ、狼憑き、狐憑き、狼夢人、鍵師、マーリン、共有者は候補に出ません。偽占い師は占い師として表示されます。",
    "achievements": [
      {
        "id": "cosplay_day_role",
        "name": "昼の装い",
        "desc": "コスプレイヤーで昼能力持ちにコスプレする。"
      },
      {
        "id": "cosplay_night_role",
        "name": "夜の装い",
        "desc": "コスプレイヤーで夜能力持ちにコスプレする。"
      },
      {
        "id": "cosplay_notice_role",
        "name": "知らせる装い",
        "desc": "コスプレイヤーで通知系役職にコスプレする。"
      },
      {
        "id": "first_cosplayer",
        "name": "衣装箱を開いて",
        "desc": "初めてコスプレイヤーになる。"
      },
      {
        "id": "win_cosplayer",
        "name": "完璧ななりきり",
        "desc": "コスプレイヤーで勝利する。"
      }
    ],
    "kana": "コスプレイヤー"
  },
  {
    "key": "STAR",
    "id": "star",
    "name": "スター",
    "team": "village",
    "order": 15,
    "desc": "昼開始時にスターのプレイヤーが公開されます。",
    "achievements": [
      {
        "id": "star_multiple",
        "name": "星が並ぶ夜",
        "desc": "スターが2人以上いる。"
      },
      {
        "id": "first_star",
        "name": "注目の舞台へ",
        "desc": "初めてスターになる。"
      },
      {
        "id": "win_star",
        "name": "主役の凱旋",
        "desc": "スターで勝利する。"
      }
    ],
    "kana": "スター"
  },
  {
    "key": "STEVE",
    "id": "steve",
    "name": "スティーブ",
    "team": "village",
    "order": 45,
    "desc": "昼に死亡したり噛殺、爆殺で死亡した場合に1度だけ\n不死のトーテムで復活することができます。\nそれ以外の死因では復活できません。",
    "achievements": [
      {
        "id": "first_steve",
        "name": "スティーブ参戦！！",
        "desc": "初めてスティーブになる。"
      },
      {
        "id": "steve_win",
        "name": "不死のトーテム！！",
        "desc": "スティーブで勝利する。"
      },
      {
        "id": "steve_loss",
        "name": "盾持ってたわ",
        "desc": "スティーブで敗北する。"
      }
    ],
    "kana": "スティーブ"
  },
  {
    "key": "SPY",
    "id": "spy",
    "name": "スパイ",
    "team": "village",
    "order": 36,
    "desc": "人狼が分かる役職からは人狼として見えます。占い結果はスパイで、保安官に撃たれると誤爆になります。",
    "achievements": [
      {
        "id": "spy_survive_win",
        "name": "潜入成功",
        "desc": "スパイで生存したまま勝利する。"
      },
      {
        "id": "first_spy",
        "name": "狼に紛れる者",
        "desc": "初めてスパイになる。"
      },
      {
        "id": "win_spy",
        "name": "潜入任務完了",
        "desc": "スパイで勝利する。"
      }
    ],
    "kana": "スパイ"
  },
  {
    "key": "TOUGH_GUY",
    "id": "tough_guy",
    "name": "タフガイ",
    "team": "village",
    "order": 21,
    "desc": "最多得票になっても処刑されません。代わりに次点の得票者が処刑されます。猫又・黒猫・わら人形による道連れでも死亡しません。",
    "achievements": [
      {
        "id": "tough_substitute_exile",
        "name": "代わりに頼んだ",
        "desc": "タフガイでかわりに吊られてもらう。"
      },
      {
        "id": "tough_got_substituted",
        "name": "とばっちり担当",
        "desc": "タフガイのとばっちりを受ける。"
      },
      {
        "id": "first_tough_guy",
        "name": "鋼の肉体",
        "desc": "初めてタフガイになる。"
      },
      {
        "id": "win_tough_guy",
        "name": "最後まで倒れない",
        "desc": "タフガイで勝利する。"
      }
    ],
    "kana": "タフガイ"
  },
  {
    "key": "CHICKEN",
    "id": "chicken",
    "name": "チキン",
    "team": "village",
    "order": 16,
    "desc": "1票でも入ると死亡しますが、生き残れば村人陣営が勝利を乗っ取ります。",
    "achievements": [
      {
        "id": "chicken_shock_death",
        "name": "心臓に悪い一票",
        "desc": "チキンでショック死する。"
      },
      {
        "id": "chicken_reverse_village",
        "name": "臆病者の大逆転",
        "desc": "チキンで村人陣営を逆転させる。"
      },
      {
        "id": "first_chicken",
        "name": "臆病者の第一歩",
        "desc": "初めてチキンになる。"
      },
      {
        "id": "win_chicken",
        "name": "生き残った者が正義",
        "desc": "チキンで勝利する。"
      }
    ],
    "kana": "チキン"
  },
  {
    "key": "BARTENDER",
    "id": "bartender",
    "name": "バーテンダー",
    "team": "village",
    "order": 54,
    "desc": "開始時にランダムな1人へカクテルを渡し、酔っぱらい状態にします。元々酔っぱらいがいる場合は別の人を酔わせます。バーテンダー自身は酔っぱらいになりません。",
    "achievements": [
      {
        "id": "bartender_loss",
        "name": "閉店",
        "desc": "バーテンダーで敗北する。"
      },
      {
        "id": "first_bartender",
        "name": "ようこそ、バーへ",
        "desc": "初めてバーテンダーになる。"
      },
      {
        "id": "win_bartender",
        "name": "おいしい美酒を",
        "desc": "バーテンダーで勝利する。"
      }
    ],
    "kana": "バーテンダー"
  },
  {
    "key": "BAKER",
    "id": "baker",
    "name": "パン屋",
    "team": "village",
    "order": 14,
    "desc": "最終盤面でプレイヤーにパン屋がいれば昼にパンが焼けましたと公開されます。",
    "achievements": [
      {
        "id": "baker_multiple_bread",
        "name": "焼きたて大盛り",
        "desc": "パンが2個以上焼かれる。"
      },
      {
        "id": "first_baker",
        "name": "はじめてのパン作り",
        "desc": "初めてパン屋になる。"
      },
      {
        "id": "win_baker",
        "name": "勝利の焼きたてパン",
        "desc": "パン屋で勝利する。"
      }
    ],
    "kana": "ぱんや"
  },
  {
    "key": "PENGUIN",
    "id": "penguin",
    "name": "ペンギン",
    "team": "village",
    "order": 26,
    "desc": "ペンギンに投票した人の票は、ペンギンが投票した先へ滑ります。",
    "achievements": [
      {
        "id": "penguin_slide_win",
        "name": "氷上の勝利",
        "desc": "ペンギンで票が滑った上で勝利する。"
      },
      {
        "id": "penguin_slide_loss",
        "name": "氷上の転倒",
        "desc": "ペンギンで票が滑った上で敗北する。"
      },
      {
        "id": "first_penguin",
        "name": "氷上の一歩",
        "desc": "初めてペンギンになる。"
      },
      {
        "id": "win_penguin",
        "name": "滑って掴んだ勝利",
        "desc": "ペンギンで勝利する。"
      }
    ],
    "kana": "ペンギン"
  },
  {
    "key": "HOKMA",
    "id": "hokma",
    "name": "ホクマー",
    "team": "village",
    "order": 53,
    "desc": "昼能力を何度でも使用できます。使用するたびに昼時間が10秒短くなります。封印されている場合は使用できません。",
    "achievements": [
      {
        "id": "hokma_loss",
        "name": "意味もなく時間を無駄にしないでくだされ",
        "desc": "ホクマーで敗北する。"
      },
      {
        "id": "first_hokma",
        "name": "沈黙には対価が求められるのです",
        "desc": "初めてホクマーになる。"
      },
      {
        "id": "win_hokma",
        "name": "過去を受け入れ、未来を創り出す瞳",
        "desc": "ホクマーで勝利する。"
      }
    ],
    "kana": "ホクマー"
  },
  {
    "key": "MERLIN",
    "id": "merlin",
    "name": "マーリン",
    "team": "village",
    "order": 11,
    "desc": "墓地以外の人狼を知っています。\n\n狂人が人狼に昇格していた場合も人狼として見えます。\n人狼の有無にかかわらずマーリンCOをするのは禁止です。",
    "achievements": [
      {
        "id": "merlin_assassin_target",
        "name": "狙われし賢者",
        "desc": "マーリンでアサシンに選ばれる。"
      },
      {
        "id": "merlin_no_wolf",
        "name": "静かな夜の賢者",
        "desc": "マーリンで人狼がいないことを知る。"
      },
      {
        "id": "merlin_knows_wolf",
        "name": "狼を知る賢者",
        "desc": "マーリンで人狼を知る。"
      },
      {
        "id": "first_merlin",
        "name": "すべてを見通す者",
        "desc": "初めてマーリンになる。"
      },
      {
        "id": "win_merlin",
        "name": "正体を隠した導き手",
        "desc": "マーリンで勝利する。"
      }
    ],
    "kana": "マーリン"
  },
  {
    "key": "MAYOR",
    "id": "mayor",
    "name": "メイヤー",
    "team": "village",
    "order": 18,
    "desc": "設定した票数分投票できる村人です。",
    "achievements": [
      {
        "id": "mayor_vote_exile",
        "name": "市長の一押し",
        "desc": "メイヤーで自身が投票したところが追放される。"
      },
      {
        "id": "exiled_by_mayor_vote",
        "name": "市長票の重み",
        "desc": "メイヤーに入れられたことで追放される。"
      },
      {
        "id": "first_mayor",
        "name": "村を束ねる者",
        "desc": "初めてメイヤーになる。"
      },
      {
        "id": "win_mayor",
        "name": "民意を動かす一票",
        "desc": "メイヤーで勝利する。"
      }
    ],
    "kana": "メイヤー"
  },
  {
    "key": "MOSES",
    "id": "moses",
    "name": "モーゼス",
    "team": "village",
    "order": 48,
    "desc": "元々の投票数は0ですが、夜能力または昼能力を使われるたび投票数が1票ずつ増えます。票数はモーゼスの役職に付属します。",
    "achievements": [
      {
        "id": "first_moses",
        "name": "銃の職人",
        "desc": "初めてモーゼスになる。"
      },
      {
        "id": "moses_win",
        "name": "回避成功",
        "desc": "モーゼスで勝利する。"
      },
      {
        "id": "moses_loss",
        "name": "回避失敗",
        "desc": "モーゼスで敗北する。"
      },
      {
        "id": "moses_three_votes",
        "name": "狂いのない世界",
        "desc": "モーゼスで3票以上投票できる状態になる。"
      }
    ],
    "kana": "モーゼス"
  },
  {
    "key": "STRAW_DOLL",
    "id": "straw_doll",
    "name": "わら人形",
    "team": "village",
    "order": 9,
    "desc": "夜行動はありません。死んだときに1人選んで道連れにします。",
    "achievements": [
      {
        "id": "first_straw_doll",
        "name": "藁に宿る想い",
        "desc": "初めてわら人形になる。"
      },
      {
        "id": "win_straw_doll",
        "name": "呪いが導いた勝利",
        "desc": "わら人形で勝利する。"
      },
      {
        "id": "straw_chain_village",
        "name": "村への藁の呪い",
        "desc": "わら人形で村人陣営を道連れにする。"
      },
      {
        "id": "straw_chain_nonvillage",
        "name": "人外への藁の呪い",
        "desc": "わら人形で村人陣営以外を道連れにする。"
      }
    ],
    "kana": "わらにんぎょう"
  },
  {
    "key": "YOMI",
    "id": "yomi",
    "name": "黄泉",
    "team": "village",
    "order": 49,
    "desc": "昼能力で自分を含むプレイヤー1人を選び、付与されている状態を断ち切ります。シャッフラー、反転、恋人、愛する人、長夜、未覚醒の酔っぱらい、処刑人や復讐者などの対象、交換者や御乱心やイカロスや妖精さんの対象、口封じ、従者の主人、フリーターの就職先、銀狼のハッキング、忘却の人狼状態、狼夢人状態、グレムリンの対象、ケセドの対象を解除できます。",
    "achievements": [
      {
        "id": "yomi_loss",
        "name": "涙雨…",
        "desc": "黄泉で敗北する。"
      },
      {
        "id": "yomi_cut_village_badge",
        "name": "残夢染める繚乱の一太刀",
        "desc": "村人役についた反転、恋人、シャッフラーのいずれかを解除する。"
      },
      {
        "id": "yomi_awaken_memory",
        "name": "私たちは、どこかで会ったことがあるか？",
        "desc": "忘却の人狼状態、ハッキング状態、狼夢人状態、酔っぱらい状態のいずれかを解除する。"
      },
      {
        "id": "first_yomi",
        "name": "自滅者",
        "desc": "初めて黄泉になる。"
      },
      {
        "id": "win_yomi",
        "name": "紅葉に時雨、万里の空",
        "desc": "黄泉で勝利する。"
      }
    ],
    "kana": "よみ"
  },
  {
    "key": "ROBBER",
    "id": "robber",
    "name": "怪盗",
    "team": "village",
    "order": 4,
    "desc": "自分以外1人と役職を交換し、新しい自分の役職だけ確認できます。",
    "achievements": [
      {
        "id": "robber_steal_village",
        "name": "村の力を盗む",
        "desc": "怪盗で村人陣営役職を盗む。"
      },
      {
        "id": "robber_steal_wolf",
        "name": "狼の爪を盗む",
        "desc": "怪盗で人狼陣営役職を盗む。"
      },
      {
        "id": "robber_steal_third",
        "name": "第三の道を盗む",
        "desc": "怪盗で第三陣営役職を盗む。"
      },
      {
        "id": "robbed_village",
        "name": "村の力を奪われる",
        "desc": "怪盗に村人陣営役職を盗まれる。"
      },
      {
        "id": "robbed_wolf",
        "name": "狼の爪を奪われる",
        "desc": "怪盗に人狼陣営役職を盗まれる。"
      },
      {
        "id": "robbed_third",
        "name": "第三の道を奪われる",
        "desc": "怪盗に第三陣営役職を盗まれる。"
      },
      {
        "id": "first_robber",
        "name": "夜陰に紛れる手",
        "desc": "初めて怪盗になる。"
      },
      {
        "id": "win_robber",
        "name": "勝利を盗み取る",
        "desc": "怪盗で勝利する。"
      },
      {
        "id": "robber_steal_detective",
        "name": "怪盗キッド",
        "desc": "怪盗が名探偵と役職を交換する。"
      },
      {
        "id": "robber_robbed_after_steal",
        "name": "盗んだ獲物を盗まれる",
        "desc": "怪盗で交換した後、別の怪盗に役職を交換される。"
      },
      {
        "id": "robber_back_to_initial",
        "name": "元の鞘",
        "desc": "怪盗で交換した結果、初期役職と同じ役職になる。"
      }
    ],
    "kana": "かいとう"
  },
  {
    "key": "TRAILBLAZER",
    "id": "trailblazer",
    "name": "開拓者",
    "team": "village",
    "order": 52,
    "desc": "壊滅、存護、調和、記憶、愉悦のいずれかの運命を歩み、その運命に応じた能力を得ます。壊滅は保安官、存護は騎士、調和はカルメン、記憶は妖精さん、愉悦はいたずらっ子の能力です。",
    "achievements": [
      {
        "id": "trailblazer_first_destruction",
        "name": "ルールは、破るためにある！",
        "desc": "初めて壊滅の運命を歩む。"
      },
      {
        "id": "trailblazer_win_destruction",
        "name": "楽にしてあげる。",
        "desc": "壊滅の運命を歩む開拓者で勝利する。"
      },
      {
        "id": "trailblazer_first_preservation",
        "name": "私が守る。",
        "desc": "初めて存護の運命を歩む。"
      },
      {
        "id": "trailblazer_win_preservation",
        "name": "炎の槍よ！断ち切れ！",
        "desc": "存護の運命を歩む開拓者で勝利する。"
      },
      {
        "id": "trailblazer_first_harmony",
        "name": "ドリーム・カム・トゥルー！",
        "desc": "初めて調和の運命を歩む。"
      },
      {
        "id": "trailblazer_win_harmony",
        "name": "イッツショータイム！",
        "desc": "調和の運命を歩む開拓者で勝利する。"
      },
      {
        "id": "trailblazer_first_remembrance",
        "name": "私がついてる。",
        "desc": "初めて記憶の運命を歩む。"
      },
      {
        "id": "trailblazer_win_remembrance",
        "name": "私たちに不可能はなーい！",
        "desc": "記憶の運命を歩む開拓者で勝利する。"
      },
      {
        "id": "trailblazer_first_elation",
        "name": "今は銀河二刀流ってよんで！",
        "desc": "初めて愉悦の運命を歩む。"
      },
      {
        "id": "trailblazer_win_elation",
        "name": "最高の瞬間を彩ってあげる。",
        "desc": "愉悦の運命を歩む開拓者で勝利する。"
      }
    ],
    "kana": "かいたくしゃ"
  },
  {
    "key": "SENSE_SEER",
    "id": "sense_seer",
    "name": "感覚の占い師",
    "team": "village",
    "order": 31,
    "desc": "昼に1人を選び、その人の最終役職から陣営の気配を感じ取ります。妖狐を占っても呪殺しません。",
    "achievements": [
      {
        "id": "sense_seer_used",
        "name": "気配を読む",
        "desc": "感覚の占い師で誰かの気配を感じ取る。"
      },
      {
        "id": "first_sense_seer",
        "name": "気配を感じる者",
        "desc": "初めて感覚の占い師になる。"
      },
      {
        "id": "win_sense_seer",
        "name": "気配が導いた真実",
        "desc": "感覚の占い師で勝利する。"
      }
    ],
    "kana": "かんかくのうらないし"
  },
  {
    "key": "WHIMSICAL_SEER",
    "id": "whimsical_seer",
    "name": "気まぐれな占い師",
    "team": "village",
    "order": 57,
    "desc": "夜にプレイヤー1人または設定枚数の墓地を占います。占いは1/2の確率で失敗し、失敗した場合は役職を確認できません。成功した場合は対象の本当の初期役職を知ります。妖狐・妖狸の占いに成功すると呪殺します。狐憑きでは呪殺は発生しません。",
    "achievements": [
      {
        "id": "whimsical_seer_fail",
        "name": "今日は星が見えない",
        "desc": "気まぐれな占い師で初めて占いに失敗する。"
      },
      {
        "id": "first_whimsical_seer",
        "name": "真実への賭け",
        "desc": "初めて気まぐれな占い師になる。"
      },
      {
        "id": "win_whimsical_seer",
        "name": "気まぐれは村に微笑む",
        "desc": "気まぐれな占い師で勝利する。"
      }
    ],
    "kana": "きまぐれなうらないし"
  },
  {
    "key": "KNIGHT",
    "id": "knight",
    "name": "騎士",
    "team": "village",
    "order": 51,
    "desc": "自身以外のシャッフラー・反転・恋人が付いていない村人陣営が死亡するとき、1回だけ死から守ります。複数の騎士がいる場合は同じ対象を同時には守りません。",
    "achievements": [
      {
        "id": "knight_only_village",
        "name": "誰も守れなくとも",
        "desc": "試合終了時、自分しか村人陣営がいない状態になる。"
      },
      {
        "id": "knight_guard_queen",
        "name": "王家の親衛騎士",
        "desc": "騎士で女王を護衛する。"
      },
      {
        "id": "first_knight",
        "name": "村の用心棒",
        "desc": "初めて騎士になる。"
      },
      {
        "id": "win_knight",
        "name": "鉄壁の守護",
        "desc": "騎士で勝利する。"
      }
    ],
    "kana": "きし"
  },
  {
    "key": "FAKE_SEER",
    "id": "fake_seer",
    "name": "偽占い師",
    "team": "village",
    "order": 34,
    "desc": "本人には占い師として表示され、占い師と同じ夜能力を使えます。ただし結果は配役内からランダムに表示され、妖狐を占っても呪殺しません。",
    "achievements": [
      {
        "id": "fake_seer_lucky",
        "name": "偶然の真実",
        "desc": "偽占い師の占い結果が実際の結果と一致する。"
      },
      {
        "id": "fake_seer_fox_result",
        "name": "幻の狐火",
        "desc": "偽占い師で妖狐結果を見る。"
      },
      {
        "id": "fake_seer_vote_village_result",
        "name": "未熟さを自覚する。",
        "desc": "偽占い師で村人陣営だと占った相手に投票する。"
      },
      {
        "id": "first_fake_seer",
        "name": "曇った水晶玉",
        "desc": "初めて偽占い師になる。"
      },
      {
        "id": "win_fake_seer",
        "name": "偶然も実力のうち",
        "desc": "偽占い師で勝利する。"
      },
      {
        "id": "fake_seer_truth_exiled",
        "name": "嘘から出た真実",
        "desc": "偽占い師の結果が実際の対象役職と一致し、その対象が追放される。"
      },
      {
        "id": "fake_seer_twice_correct",
        "name": "完全に占い師",
        "desc": "偽占い師の結果が2回以上実際の役職と一致する。"
      }
    ],
    "kana": "にせうらないし"
  },
  {
    "key": "MASON",
    "id": "mason",
    "name": "共有者",
    "team": "village",
    "order": 8,
    "desc": "他の共有者がいれば確認できます。",
    "achievements": [
      {
        "id": "mason_has_partner",
        "name": "ひとりじゃない",
        "desc": "共有者で相方を確認する。"
      },
      {
        "id": "mason_no_partner",
        "name": "孤独な共有者",
        "desc": "共有者で相方がいないことを確認する。"
      },
      {
        "id": "first_mason",
        "name": "石工の合図",
        "desc": "初めて共有者になる。"
      },
      {
        "id": "win_mason",
        "name": "固い絆の勝利",
        "desc": "共有者で勝利する。"
      }
    ],
    "kana": "きょうゆうしゃ"
  },
  {
    "key": "APPRENTICE_SEER",
    "id": "apprentice_seer",
    "name": "見習いの占い師",
    "team": "village",
    "order": 59,
    "desc": "夜にプレイヤー1人の初期役職が人狼か、そうでないかを占います。\n墓地を占うことはできません。\n呪殺することもできません。",
    "achievements": [
      {
        "id": "first_apprentice_seer",
        "name": "半人前の初仕事",
        "desc": "初めて見習いの占い師になる。"
      },
      {
        "id": "win_apprentice_seer",
        "name": "腐っても占い師",
        "desc": "見習いの占い師で勝利する。"
      },
      {
        "id": "lose_apprentice_seer",
        "name": "半分しか見えなかった真実",
        "desc": "見習いの占い師で敗北する。"
      },
      {
        "id": "apprentice_seer_same_target_as_seer",
        "name": "詳しい話はベテランにお任せします。",
        "desc": "占い師と同じ相手を占う。"
      },
      {
        "id": "apprentice_seer_black_result_exiled",
        "name": "迷いのない断定",
        "desc": "黒結果をもらったうえでその相手を追放し勝利する。"
      }
    ],
    "kana": "みならいのうらないし"
  },
  {
    "key": "LOOKOUT",
    "id": "lookout",
    "name": "見張り番",
    "team": "village",
    "order": 60,
    "desc": "夜に自分以外のプレイヤー1人を選び、\nその人が夜に何か行動したかどうかを昼開始時に知ることができます。\n役職が入れ替わった場合、\n選んだ対象の情報は現在見張り番になっているプレイヤーへ引き継がれます。\n酔っぱらっていた場合は酔いが覚めても夜能力を使えません。",
    "achievements": [
      {
        "id": "first_lookout",
        "name": "初めての夜番",
        "desc": "初めて見張り番になる。"
      },
      {
        "id": "win_lookout",
        "name": "見届けた夜",
        "desc": "見張り番で勝利する。"
      },
      {
        "id": "lose_lookout",
        "name": "見逃した夜",
        "desc": "見張り番で敗北する。"
      },
      {
        "id": "lookout_role_moved",
        "name": "引き継がれる視線",
        "desc": "役職が入れ替わり、前任の見張り番が選んだ対象の行動有無が自分に通知される。"
      },
      {
        "id": "lookout_target_no_action",
        "name": "誰も動かなかった夜",
        "desc": "選んだ相手が「行動していませんでした。」という結果を得る。"
      }
    ],
    "kana": "みはりばん"
  },
  {
    "key": "KEYMASTER",
    "id": "keymaster",
    "name": "鍵師",
    "team": "village",
    "order": 23,
    "desc": "夜にプレイヤーを1人選び、その人の役職をロックします。ロックされた役職は、怪盗・いたずらっ子・グレムリン・シャッフラー・墓荒らし・ドッペルゲンガーなどの役職変更系の影響を受けません。",
    "achievements": [
      {
        "id": "keymaster_unlock_aa",
        "name": "心の鍵開け",
        "desc": "鍵師でA.A.をロックする。"
      },
      {
        "id": "keymaster_lock_self",
        "name": "自分を守る鍵",
        "desc": "鍵師で自分の役職をロックする。"
      },
      {
        "id": "keymaster_lock_other",
        "name": "他者を守る鍵",
        "desc": "鍵師で他者の役職をロックする。"
      },
      {
        "id": "keymaster_block_change",
        "name": "変化を止める鍵",
        "desc": "自身がロックしたことにより役職の変化が失敗する。"
      },
      {
        "id": "locked_change_failed",
        "name": "閉ざされた変化",
        "desc": "ロックされていて役職変化に失敗する。"
      },
      {
        "id": "first_keymaster",
        "name": "鍵を握る者",
        "desc": "初めて鍵師になる。"
      },
      {
        "id": "win_keymaster",
        "name": "完全封鎖",
        "desc": "鍵師で勝利する。"
      },
      {
        "id": "keymaster_full_lockdown",
        "name": "完全封鎖",
        "desc": "鍵師と封印の狂人が同じプレイヤーを対象にする。"
      },
      {
        "id": "keymaster_stop_shuffler",
        "name": "シュッフル禁止令",
        "desc": "ロックによってシャッフラーの変化を失敗させる。"
      }
    ],
    "kana": "かぎし"
  },
  {
    "key": "FOX_MARKED",
    "id": "fox_marked",
    "name": "狐憑き",
    "team": "village",
    "order": 22,
    "desc": "本人視点では村人として扱われますが、占われると妖狐として判定されます。",
    "achievements": [
      {
        "id": "first_fox_marked",
        "name": "狐の呪いを宿す村人",
        "desc": "初めて狐憑きになる。"
      },
      {
        "id": "win_fox_marked",
        "name": "呪いと共に生き残る",
        "desc": "狐憑きで勝利する。"
      }
    ],
    "kana": "きつねつき"
  },
  {
    "key": "INSOMNIAC",
    "id": "insomniac",
    "name": "後覚者",
    "team": "village",
    "order": 7,
    "desc": "夜行動がすべて終わったあと、自分の最終役職を確認できます。",
    "achievements": [
      {
        "id": "insomniac_changed",
        "name": "目覚めたら別人",
        "desc": "後覚者で自分の役職変化を確認する。"
      },
      {
        "id": "insomniac_from_other",
        "name": "遅れてきた目覚め",
        "desc": "元々別役職だったのに後覚者になっていたことを確認する。"
      },
      {
        "id": "insomniac_stayed",
        "name": "変わらぬ目覚め",
        "desc": "後覚者のままだったことを確認する。"
      },
      {
        "id": "first_insomniac",
        "name": "眠れぬ夜",
        "desc": "初めて後覚者になる。"
      },
      {
        "id": "win_insomniac",
        "name": "夜明けに知る真実",
        "desc": "後覚者で勝利する。"
      }
    ],
    "kana": "こうかくしゃ"
  },
  {
    "key": "GORANSHIN",
    "id": "goranshin",
    "name": "御乱心",
    "team": "village",
    "order": 44,
    "desc": "昼能力で1人を選び、その人の投票先をランダムに変更します。",
    "achievements": [
      {
        "id": "first_goranshin",
        "name": "運命の紐",
        "desc": "初めて御乱心になる。"
      },
      {
        "id": "goranshin_win",
        "name": "キノコの力",
        "desc": "御乱心で勝利する。"
      },
      {
        "id": "goranshin_loss",
        "name": "ぴ〜〜ぶ〜〜",
        "desc": "御乱心で敗北する。"
      }
    ],
    "kana": "ごらんしん"
  },
  {
    "key": "EXCHANGER",
    "id": "exchanger",
    "name": "交換者",
    "team": "village",
    "order": 25,
    "desc": "昼能力で2人を選び、その2人の票数を入れ替えます。",
    "achievements": [
      {
        "id": "exchanger_swap_vote",
        "name": "票先交換",
        "desc": "交換者で票先を交換する。"
      },
      {
        "id": "exchanger_swap_self",
        "name": "自分も巻き込む交換",
        "desc": "交換者で自身と誰かを交換する。"
      },
      {
        "id": "exchanger_swap_others",
        "name": "他人同士の交換",
        "desc": "交換者で他人同士を交換する。"
      },
      {
        "id": "first_exchanger",
        "name": "票を操る者",
        "desc": "初めて交換者になる。"
      },
      {
        "id": "win_exchanger",
        "name": "票の行方は掌の上",
        "desc": "交換者で勝利する。"
      }
    ],
    "kana": "こうかんしゃ"
  },
  {
    "key": "LIGHT_APOSTLE",
    "id": "light_apostle",
    "name": "光の使徒",
    "team": "village",
    "order": 1,
    "desc": "試合開始時に村人陣営の役職へランダムに変化します。新聞結果には表示されません。",
    "achievements": [],
    "kana": "ひかりのしと"
  },
  {
    "key": "FINGER_READER",
    "id": "finger_reader",
    "name": "指読み",
    "team": "village",
    "order": 39,
    "desc": "夜に墓地以外のプレイヤー2人の初期役職を確認できます。妖狐や狐憑きを確認しても呪殺は発生しません。指読みCOと指読み結果の開示は禁止です。他役職COや嘘の結果報告、別役職としての発言は可能です。",
    "achievements": [
      {
        "id": "first_finger_reader",
        "name": "二本指の巫女",
        "desc": "初めて指読みになる。"
      },
      {
        "id": "finger_reader_win",
        "name": "褪せ人の追憶",
        "desc": "指読みで勝利する。"
      },
      {
        "id": "finger_reader_loss",
        "name": "二本指の追憶",
        "desc": "指読みで敗北する。"
      }
    ],
    "kana": "ゆびよみ"
  },
  {
    "key": "POET",
    "id": "poet",
    "name": "詩人",
    "team": "village",
    "order": 35,
    "desc": "昼開始時、夜にランダムな1つの役職が\n誰を対象にしたかが分かります。",
    "achievements": [
      {
        "id": "poet_notice",
        "name": "夜の詩を聞く",
        "desc": "詩人で夜能力の使用情報を受け取る。"
      },
      {
        "id": "first_poet",
        "name": "夜を詠む者",
        "desc": "初めて詩人になる。"
      },
      {
        "id": "win_poet",
        "name": "勝利を詠う詩人",
        "desc": "詩人で勝利する。"
      }
    ],
    "kana": "しじん"
  },
  {
    "key": "CURSED_ONE",
    "id": "cursed_one",
    "name": "呪われし者",
    "team": "village",
    "order": 29,
    "desc": "吊られなければ村人陣営のままですが、吊られると人狼陣営になります。",
    "achievements": [
      {
        "id": "first_cursed_one",
        "name": "忍び寄る呪い",
        "desc": "初めて呪われし者になる。"
      },
      {
        "id": "win_cursed_one",
        "name": "呪いを退けた朝",
        "desc": "呪われし者で勝利する。"
      }
    ],
    "kana": "のろわれしもの"
  },
  {
    "key": "QUEEN",
    "id": "queen",
    "name": "女王",
    "team": "village",
    "order": 20,
    "desc": "昼開始時に、最終的に村人陣営であり酔っぱらっていないプレイヤーにだけ女王が誰か通知されます。恋人でも最終役職が村人陣営なら通知対象です。女王が処刑された場合、恋人を除く村人陣営は敗北します。女王と人狼が同時に吊られた場合は、他の単独第三陣営が勝っていなければ勝者なしになります。",
    "achievements": [
      {
        "id": "queen_dies",
        "name": "崩れた王冠",
        "desc": "女王が死亡する。"
      },
      {
        "id": "first_queen",
        "name": "王冠を戴く者",
        "desc": "初めて女王になる。"
      },
      {
        "id": "win_queen",
        "name": "王国に訪れた朝",
        "desc": "女王で勝利する。"
      },
      {
        "id": "queen_two_crowns",
        "name": "二つの王冠",
        "desc": "最終役職が女王のプレイヤーが2人以上生存して勝利する。"
      }
    ],
    "kana": "じょおう"
  },
  {
    "key": "MAJOR",
    "id": "major",
    "name": "少佐",
    "team": "village",
    "order": 38,
    "desc": "夜にプレイヤー1人を選びます。昼開始時、その対象が村人陣営以外なら村人に変化させます。救済対象が投票で追放されそうになった場合、生存している少佐が身代わりになります。",
    "achievements": [
      {
        "id": "major_village_win",
        "name": "美しい世界",
        "desc": "少佐として村人陣営で勝利する。"
      },
      {
        "id": "major_sacrifice",
        "name": "顔を上げて進み続けなさい",
        "desc": "少佐の身代わり能力で死亡する。"
      },
      {
        "id": "major_drunk",
        "name": "酒を飲む教師",
        "desc": "少佐で酔っぱらう。"
      },
      {
        "id": "major_coffee",
        "name": "列車のナビゲーター",
        "desc": "少佐でコーヒーを受け取る。"
      }
    ],
    "kana": "しょうさ"
  },
  {
    "key": "PSYCHOLOGIST",
    "id": "psychologist",
    "name": "心理士",
    "team": "village",
    "order": 55,
    "desc": "昼能力でプレイヤー2人を選び、2人の最終役職が同じ陣営扱いか別陣営扱いかを検査します。同じ陣営扱いなら適合、別陣営扱いなら不適合と分かります。第三陣営は基本的に役職ごとに別陣営扱いですが、同じ役職同士は同陣営扱いです。",
    "achievements": [
      {
        "id": "first_psychologist",
        "name": "心のプロファイラー",
        "desc": "初めて心理士になる。"
      },
      {
        "id": "psychologist_win",
        "name": "マインドナビゲーター",
        "desc": "心理士で勝利する。"
      },
      {
        "id": "psychologist_loss",
        "name": "人間不信",
        "desc": "心理士で敗北する。"
      },
      {
        "id": "psychologist_match",
        "name": "見えない繋がり",
        "desc": "心理士で同陣営扱いの2人を選ぶ。"
      },
      {
        "id": "psychologist_mismatch",
        "name": "歪んだ関係",
        "desc": "心理士で別陣営扱いの2人を選ぶ。"
      },
      {
        "id": "psychologist_two_masons",
        "name": "ポンコツ心理士",
        "desc": "心理士で共有者2人を選ぶ。"
      }
    ],
    "kana": "しんりし"
  },
  {
    "key": "NEWSPAPER",
    "id": "newspaper",
    "name": "新聞配達員",
    "team": "village",
    "order": 17,
    "desc": "昼開始時に夜に能力を使った役職の名前が新聞として通知されます。プレイヤー名は分かりません。闇の化身・光の使徒・銀色の影は表示されません。",
    "achievements": [
      {
        "id": "newspaper_no_info",
        "name": "白紙の新聞",
        "desc": "新聞配達員で情報がなかったことを知る。"
      },
      {
        "id": "newspaper_three_info",
        "name": "情報山盛り",
        "desc": "新聞配達員で3種類以上の情報を知る。"
      },
      {
        "id": "first_newspaper",
        "name": "朝刊をお届け",
        "desc": "初めて新聞配達員になる。"
      },
      {
        "id": "win_newspaper",
        "name": "勝利を告げる号外",
        "desc": "新聞配達員で勝利する。"
      }
    ],
    "kana": "しんぶんはいたついん"
  },
  {
    "key": "PRIEST",
    "id": "priest",
    "name": "神官",
    "team": "village",
    "order": 41,
    "desc": "神官が生存していると神勝利を無効にする。\n神の祝福は無効にしない。\n神官が死亡していると神が勝利しても、\n村人陣営が一緒に勝てる。",
    "achievements": [
      {
        "id": "first_priest",
        "name": "神に仕えし者",
        "desc": "初めて神官になる。"
      },
      {
        "id": "win_priest",
        "name": "祝福の代行者",
        "desc": "神官で勝利する。"
      },
      {
        "id": "priest_god_village",
        "name": "奇跡の立会人",
        "desc": "神の勝利によって村人陣営を追加勝利させる。"
      }
    ],
    "kana": "しんかん"
  },
  {
    "key": "SEER",
    "id": "seer",
    "name": "占い師",
    "team": "village",
    "order": 3,
    "desc": "プレイヤー1人を見るか、墓地カードを設定された枚数まで確認できます。墓地占い回数は詳細設定で変更できます。",
    "achievements": [
      {
        "id": "seer_player_inspect",
        "name": "初めての人物占い",
        "desc": "占い師でプレイヤーを占う。"
      },
      {
        "id": "seer_center_inspect",
        "name": "墓地を覗く者",
        "desc": "占い師で墓地を占う。"
      },
      {
        "id": "seer_find_wolf",
        "name": "狼の影を見た",
        "desc": "占い師で人狼系の結果を見る。"
      },
      {
        "id": "seer_curse_fox",
        "name": "呪殺の一手",
        "desc": "占い師で初めて妖狐を呪殺する。"
      },
      {
        "id": "seer_inspect_wolf_marked",
        "name": "本当に君は人狼なの？",
        "desc": "占い師で初めて狼憑きを占う。"
      },
      {
        "id": "seer_inspect_fox_marked",
        "name": "狐の呪いの結末",
        "desc": "占い師で初めて狐憑きを占う。"
      },
      {
        "id": "first_seer",
        "name": "水晶玉の向こう側",
        "desc": "初めて占い師になる。"
      },
      {
        "id": "win_seer",
        "name": "真実が導く朝",
        "desc": "占い師で勝利する。"
      },
      {
        "id": "seer_mad_seer_same_target",
        "name": "水晶玉の裏表",
        "desc": "占い師と狂った占い師が同じプレイヤーを占う。"
      }
    ],
    "kana": "うらないし"
  },
  {
    "key": "ELECTION_MANAGER",
    "id": "election_manager",
    "name": "選挙管理委員",
    "team": "village",
    "order": 47,
    "desc": "投票中、誰が誰に投票したかをリアルタイムで知ることができます。投票先が変更された場合も、変更後の投票情報が通知されます。",
    "achievements": [
      {
        "id": "first_election_manager",
        "name": "選管就任",
        "desc": "初めて選挙管理委員になる。"
      },
      {
        "id": "win_election_manager",
        "name": "公正なる管理者",
        "desc": "選挙管理委員で勝利する。"
      },
      {
        "id": "election_manager_change_after_observation",
        "name": "票読みの達人",
        "desc": "他のプレイヤーの投票を確認した後、自身の投票先を変更する。"
      },
      {
        "id": "election_manager_witness_change",
        "name": "風向きの変化",
        "desc": "他のプレイヤーが投票先を変更する瞬間を確認する。"
      }
    ],
    "kana": "せんきょかんりいいん"
  },
  {
    "key": "VILLAGER",
    "id": "villager",
    "name": "村人",
    "team": "village",
    "order": 2,
    "desc": "能力はありません。",
    "achievements": [
      {
        "id": "first_villager",
        "name": "名もなき村人",
        "desc": "初めて村人になる。"
      },
      {
        "id": "win_villager",
        "name": "平凡こそ最強",
        "desc": "村人で勝利する。"
      },
      {
        "id": "villager_survive_win",
        "name": "静かな村の守り手",
        "desc": "村人で生存したまま勝利する。"
      }
    ],
    "kana": "むらびと"
  },
  {
    "key": "LIBRA",
    "id": "libra",
    "name": "天秤",
    "team": "village",
    "order": 33,
    "desc": "昼に2人を選び、投票対象をその2人だけに制限して投票へ移行します。",
    "achievements": [
      {
        "id": "libra_win",
        "name": "天秤の勝利",
        "desc": "天秤で能力を発動して勝利する。"
      },
      {
        "id": "libra_loss",
        "name": "天秤の敗北",
        "desc": "天秤で能力を発動したうえで敗北する。"
      },
      {
        "id": "first_libra",
        "name": "運命を量る者",
        "desc": "初めて天秤になる。"
      },
      {
        "id": "win_libra",
        "name": "均衡を制する者",
        "desc": "天秤で勝利する。"
      },
      {
        "id": "libra_chosen_winner",
        "name": "秤が選んだ勝者",
        "desc": "能力で選んだ2人のうち、生存した片方だけが勝利する。"
      }
    ],
    "kana": "てんびん"
  },
  {
    "key": "THIEF",
    "id": "thief",
    "name": "盗賊",
    "team": "village",
    "order": 30,
    "desc": "昼能力で選択したプレイヤーの票数を1票盗みます。",
    "achievements": [
      {
        "id": "thief_steal_vote",
        "name": "一票いただき",
        "desc": "盗賊で票を盗む。"
      },
      {
        "id": "vote_stolen",
        "name": "盗まれた一票",
        "desc": "盗賊に票を盗まれる。"
      },
      {
        "id": "first_thief",
        "name": "一票いただきます",
        "desc": "初めて盗賊になる。"
      },
      {
        "id": "win_thief",
        "name": "盗んだ票で掴む勝利",
        "desc": "盗賊で勝利する。"
      }
    ],
    "kana": "とうぞく"
  },
  {
    "key": "DICTATOR",
    "id": "dictator",
    "name": "独裁者",
    "team": "village",
    "order": 24,
    "desc": "昼能力で独裁を宣言すると、即座に議論を打ち切って選んだ相手だけを処刑します。",
    "achievements": [
      {
        "id": "dictator_execute",
        "name": "独裁処刑",
        "desc": "独裁者で独裁処刑を行う。"
      },
      {
        "id": "dictator_couped",
        "name": "クーデターの結末",
        "desc": "独裁者で反逆の狂人にクーデターを起こされる。"
      },
      {
        "id": "first_dictator",
        "name": "絶対権力",
        "desc": "初めて独裁者になる。"
      },
      {
        "id": "win_dictator",
        "name": "我が一声で決着を",
        "desc": "独裁者で勝利する。"
      }
    ],
    "kana": "どくさいしゃ"
  },
  {
    "key": "CAT_SIDHE",
    "id": "cat_sidhe",
    "name": "猫又",
    "team": "village",
    "order": 10,
    "desc": "自分が処刑されたらランダムな1人を道連れにします。",
    "achievements": [
      {
        "id": "first_cat_sidhe",
        "name": "二つ目の命",
        "desc": "初めて猫又になる。"
      },
      {
        "id": "win_cat_sidhe",
        "name": "猫の恩返し",
        "desc": "猫又で勝利する。"
      },
      {
        "id": "cat_sidhe_chain_village",
        "name": "猫又の村道連れ",
        "desc": "猫又で村人陣営を道連れにする。"
      },
      {
        "id": "cat_sidhe_chain_nonvillage",
        "name": "猫又の人外道連れ",
        "desc": "猫又で村人陣営以外を道連れにする。"
      },
      {
        "id": "cat_sidhe_chain_queen",
        "name": "王冠を連れていく猫",
        "desc": "猫又で女王を道連れにする。"
      }
    ],
    "kana": "ねこまた"
  },
  {
    "key": "WATCHDOG",
    "id": "watchdog",
    "name": "番犬",
    "team": "village",
    "order": 27,
    "desc": "夜に1人を飼い主に選び、その相手は吊られなくなります。しかし番犬自身が飼い主に投票すると噛み殺すことができます。",
    "achievements": [
      {
        "id": "watchdog_protect_owner",
        "name": "飼い主を守る",
        "desc": "番犬で飼い主を守る。"
      },
      {
        "id": "watchdog_bite_owner",
        "name": "忠犬の牙",
        "desc": "番犬で飼い主を噛み殺す。"
      },
      {
        "id": "first_watchdog",
        "name": "忠犬の誓い",
        "desc": "初めて番犬になる。"
      },
      {
        "id": "win_watchdog",
        "name": "飼い主を守り抜く",
        "desc": "番犬で勝利する。"
      },
      {
        "id": "watchdog_queen_win",
        "name": "女王様の愛犬",
        "desc": "女王を飼い主にした番犬が勝利する。"
      }
    ],
    "kana": "ばんけん"
  },
  {
    "key": "PRINCESS",
    "id": "princess",
    "name": "姫君",
    "team": "village",
    "order": 32,
    "desc": "本人視点や一部参照では村人として扱われます。女王が不在の場合、昼開始時に女王へ昇格することがあります。",
    "achievements": [
      {
        "id": "princess_succeeds",
        "name": "王冠を継ぐ者",
        "desc": "姫君が女王に即位する。"
      },
      {
        "id": "queen_princess_both_die",
        "name": "王国の悲劇",
        "desc": "女王と姫君がどちらも死亡する。"
      },
      {
        "id": "princess_day_succeeds",
        "name": "議論前の戴冠",
        "desc": "議論開始時点で姫君が女王に即位する。"
      },
      {
        "id": "first_princess",
        "name": "王国の希望",
        "desc": "初めて姫君になる。"
      },
      {
        "id": "win_princess",
        "name": "王冠を受け継ぐ者",
        "desc": "姫君で勝利する。"
      },
      {
        "id": "princess_crown_continues",
        "name": "王冠は途絶えない",
        "desc": "女王死亡後に姫君が即位し、村人陣営が勝利する。"
      },
      {
        "id": "princess_love_follow_succession",
        "name": "王国最後の希望",
        "desc": "女王の恋人心中後に即位し、王国滅亡を防ぐ。"
      }
    ],
    "kana": "ひめぎみ"
  },
  {
    "key": "SHERIFF",
    "id": "sheriff",
    "name": "保安官",
    "team": "village",
    "order": 28,
    "desc": "昼能力で1人を撃ち、村人陣営でなければ勝利条件と投票権を失わせます。しかし村人陣営を撃ち抜こうとすると保安官自身の投票権と勝利条件が失われてしまいます。",
    "achievements": [
      {
        "id": "sheriff_execute_success",
        "name": "執行成功",
        "desc": "保安官で人外を執行する。"
      },
      {
        "id": "sheriff_misfire",
        "name": "痛恨の誤爆",
        "desc": "保安官で誤爆する。"
      },
      {
        "id": "sheriff_special_village",
        "name": "見えない罪",
        "desc": "保安官で恋人、反転、シャッフラーつきの村役職を執行する。"
      },
      {
        "id": "first_sheriff",
        "name": "正義の銃を手に",
        "desc": "初めて保安官になる。"
      },
      {
        "id": "win_sheriff",
        "name": "正義の執行者",
        "desc": "保安官で勝利する。"
      },
      {
        "id": "sheriff_shoot_lover",
        "name": "愛ゆえの誤爆",
        "desc": "自分の恋人を保安官能力で撃つ。"
      }
    ],
    "kana": "ほあんかん"
  },
  {
    "key": "RELIC_ROBBER",
    "id": "relic_robber",
    "name": "墓荒らし",
    "team": "village",
    "order": 5,
    "desc": "夜に墓地カード1枚と自分の役職を交換します。交換後の役職に夜行動があればその能力も使えます。",
    "achievements": [
      {
        "id": "relic_steal_village",
        "name": "墓地の村役職",
        "desc": "墓荒らしで村人陣営役職を盗む。"
      },
      {
        "id": "relic_steal_wolf",
        "name": "墓地の狼役職",
        "desc": "墓荒らしで人狼陣営役職を盗む。"
      },
      {
        "id": "relic_steal_third",
        "name": "墓地の第三役職",
        "desc": "墓荒らしで第三陣営役職を盗む。"
      },
      {
        "id": "first_relic_robber",
        "name": "墓地からの拾い物",
        "desc": "初めて墓荒らしになる。"
      },
      {
        "id": "win_relic_robber",
        "name": "死者から託された勝利",
        "desc": "墓荒らしで勝利する。"
      },
      {
        "id": "relic_revive_wolf",
        "name": "蘇る人狼",
        "desc": "墓荒らしで人狼系役職を盗む。"
      },
      {
        "id": "relic_steal_queen",
        "name": "墓地の王冠",
        "desc": "墓地から女王を盗む。"
      },
      {
        "id": "relic_already_robbed",
        "name": "なんだよすでに荒らされてるじゃねえか",
        "desc": "他の墓荒らしにすでに盗まれている墓から役職を盗む。"
      }
    ],
    "kana": "はかあらし"
  },
  {
    "key": "VISITOR",
    "id": "visitor",
    "name": "訪問者",
    "team": "village",
    "order": 19,
    "desc": "夜に1人を訪問します。自分は相手の役職を知りませんが、相手にはあなたが訪問したことが通知されます。",
    "achievements": [
      {
        "id": "visited_by_visitor",
        "name": "来客あり",
        "desc": "誰かに訪問される。"
      },
      {
        "id": "first_visitor",
        "name": "今夜、お邪魔します",
        "desc": "初めて訪問者になる。"
      },
      {
        "id": "win_visitor",
        "name": "足跡が導いた勝利",
        "desc": "訪問者で勝利する。"
      }
    ],
    "kana": "ほうもんしゃ"
  },
  {
    "key": "FAIRY",
    "id": "fairy",
    "name": "妖精さん",
    "team": "village",
    "order": 42,
    "desc": "昼能力で自分以外の1人へバリアを付与し、その人に入る票を1票分防ぎます。",
    "achievements": [
      {
        "id": "fairy_win",
        "name": "真我の力",
        "desc": "妖精さんで勝利する。"
      },
      {
        "id": "fairy_loss",
        "name": "可愛い妖精さん",
        "desc": "妖精さんで敗北する。"
      },
      {
        "id": "fairy_barrier_block",
        "name": "ハーイ♪あたしに会いたかった？",
        "desc": "妖精さんのバリアで1票を防ぐ。"
      }
    ],
    "kana": "ようせいさん"
  },
  {
    "key": "BELL_MIKO",
    "id": "bell_miko",
    "name": "鈴の巫女",
    "team": "village",
    "order": 62,
    "desc": "昼開始時、自身が夜の間に能力を使われた回数分だけ鈴の音が鳴ります。\n\nまた、自身に昼能力が使われるたびに鈴の音が鳴ります。",
    "achievements": [
      {
        "id": "first_bell_miko",
        "name": "鈴の音の赴くままに",
        "desc": "初めて鈴の巫女になる。"
      },
      {
        "id": "win_bell_miko",
        "name": "鈴の導き",
        "desc": "鈴の巫女で勝利する。"
      },
      {
        "id": "lose_bell_miko",
        "name": "空耳の巫女",
        "desc": "鈴の巫女で敗北する。"
      },
      {
        "id": "bell_miko_silent_night",
        "name": "静寂の一夜",
        "desc": "一度も鈴が鳴らないまま朝を迎える。"
      },
      {
        "id": "bell_miko_multi_ring",
        "name": "神楽鈴、乱れ打つ",
        "desc": "同じ夜に複数回鈴が鳴る(2人以上から対象にされる)。"
      },
      {
        "id": "bell_miko_day_ring",
        "name": "昼下がりの鈴音",
        "desc": "昼の間に能力の対象にされ、鈴が鳴る。"
      }
    ],
    "kana": "すずのみこ"
  },
  {
    "key": "MEDIUM",
    "id": "medium",
    "name": "霊媒師",
    "team": "village",
    "order": 58,
    "desc": "昼能力で、昼議論中に死亡したプレイヤー1人の最終役職を調べます。ただし、呪殺で死亡したプレイヤーは対象にできません。",
    "achievements": [
      {
        "id": "first_medium",
        "name": "死者の声を聞く者",
        "desc": "初めて霊媒師になる。"
      },
      {
        "id": "win_medium",
        "name": "冥界からの助言",
        "desc": "霊媒師で勝利する。"
      }
    ],
    "kana": "れいばいし"
  },
  {
    "key": "WOLF_DREAMER",
    "id": "wolf_dreamer",
    "name": "狼夢人",
    "team": "village",
    "order": 12,
    "desc": "自分のことを人狼だと思い込んでいる村人です。占い結果は村人です。夜は相方のいない一人の人狼として認識します。",
    "achievements": [
      {
        "id": "first_wolf_dreamer",
        "name": "人狼になった夢",
        "desc": "初めて狼夢人になる。"
      },
      {
        "id": "win_wolf_dreamer",
        "name": "悪夢からの目覚め",
        "desc": "狼夢人で勝利する。"
      },
      {
        "id": "wolf_dreamer_vote_village",
        "name": "夢の中から村へ一票",
        "desc": "狼夢人で村人陣営に投票する。"
      },
      {
        "id": "wolf_dreamer_vote_wolf",
        "name": "夢の中から狼へ一票",
        "desc": "狼夢人で人狼陣営に投票する。"
      }
    ],
    "kana": "おおかみゆめびと"
  },
  {
    "key": "WOLF_MARKED",
    "id": "wolf_marked",
    "name": "狼憑き",
    "team": "village",
    "order": 13,
    "desc": "自認はただの村人ですが、占われると人狼結果が出ます。",
    "achievements": [
      {
        "id": "first_wolf_marked",
        "name": "狼の影を宿す村人",
        "desc": "初めて狼憑きになる。"
      },
      {
        "id": "win_wolf_marked",
        "name": "疑いを越えた勝利",
        "desc": "狼憑きで勝利する。"
      }
    ],
    "kana": "おおかみつき"
  },
  {
    "key": "AGITATOR",
    "id": "agitator",
    "name": "煽動者",
    "team": "village",
    "order": 61,
    "desc": "夜に煽るプレイヤーを1人選択します。\n煽られたプレイヤーは投票される票数が1票加算されます。",
    "achievements": [
      {
        "id": "agitator_loss",
        "name": "空回りの演説",
        "desc": "煽動者で敗北する。"
      },
      {
        "id": "agitator_extra_exile",
        "name": "独裁の裏で、もう一人",
        "desc": "加算した票のせいで、独裁処刑とは別にもう1人が同数投票で追放される。"
      },
      {
        "id": "agitator_coup_suppressed",
        "name": "クーデターの鎮圧",
        "desc": "反逆の狂人に票を加算し、同数投票で反逆の狂人ごと死なせてクーデターを不発にする。"
      },
      {
        "id": "agitator_mutual",
        "name": "双極の煽動",
        "desc": "煽動者と狂った煽動者がお互いに煽動する。"
      },
      {
        "id": "first_agitator",
        "name": "アジテーター",
        "desc": "初めて煽動者になる。"
      },
      {
        "id": "win_agitator",
        "name": "大衆への誘導",
        "desc": "煽動者で勝利する。"
      }
    ],
    "kana": "せんどうしゃ"
  },
  {
    "key": "COUNSELOR",
    "id": "counselor",
    "name": "カウンセラー",
    "team": "village",
    "order": 68,
    "desc": "昼能力で選んだ対象が狂人なら村人に更生させます。\n狂人以外に使った場合は失敗します。",
    "achievements": [
      {
        "id": "first_counselor",
        "name": "カウンセリング",
        "desc": "初めてカウンセラーになる。"
      },
      {
        "id": "counselor_win",
        "name": "もっといい存在になれるという希望",
        "desc": "カウンセラーとして村人陣営で勝利する。"
      },
      {
        "id": "counselor_loss",
        "name": "私はいい人だから…",
        "desc": "カウンセラーとして敗北する。"
      },
      {
        "id": "counselor_forced_counseling",
        "name": "強制カウンセリング",
        "desc": "狂人に対して能力を使う。"
      },
      {
        "id": "counselor_misplaced_kindness",
        "name": "ズレた好意",
        "desc": "狂人以外に対して能力を使う。"
      }
    ],
    "kana": "カウンセラー"
  },
  {
    "key": "DONUT_SHOP",
    "id": "donut_shop",
    "name": "ドーナツ屋",
    "team": "village",
    "order": 63,
    "desc": "昼開始時ドーナツ屋を除く\nランダムなプレイヤー1人にドーナツを届けます。\nドーナツは1人1回までしか受け取れず\nドーナツ屋自身もドーナツを受け取ることが出来ないため\n他に届ける相手がいなかった場合\n届けられず自分の元に戻ってきます。",
    "achievements": [
      {
        "id": "donut_shop_loss",
        "name": "売れ残ったドーナツ",
        "desc": "ドーナツ屋で敗北する。"
      },
      {
        "id": "donut_shop_no_recipient",
        "name": "返送ドーナツ",
        "desc": "ドーナツを届けられなかったことがある。"
      },
      {
        "id": "donut_shop_omakanai",
        "name": "まかないドーナツ",
        "desc": "初期役職がドーナツ屋だったが役職が変わり、その後ドーナツが届く。"
      },
      {
        "id": "donut_shop_should_be",
        "name": "ドーナツ屋のはずなのに。",
        "desc": "ハッキングやクローンでドーナツ屋だと思い込んでいる状態でドーナツが届く。"
      },
      {
        "id": "donut_shop_with_coffee",
        "name": "食後のコーヒー、ドーナツを添えて。",
        "desc": "コーヒーとドーナツが同時に届く。"
      },
      {
        "id": "first_donut_shop",
        "name": "あなたに届け",
        "desc": "初めてドーナツ屋になる。"
      },
      {
        "id": "win_donut_shop",
        "name": "注文の多いドーナツ店",
        "desc": "ドーナツ屋で勝利する。"
      }
    ],
    "kana": "どーなつや"
  },
  {
    "key": "HAYATOCHIRI",
    "id": "hayatochiri",
    "name": "早とちり",
    "team": "village",
    "order": 64,
    "desc": "自身が投票した対象が追放された場合\n昇格していない狂人、狼夢人、狼憑き\n妖狸、スパイを追放しても\n人狼を追放できたことにします。\nまた、自身が投票した対象が追放されたとき\nその対象が白狼、忘却の人狼だった場合\n人狼を追放できなかったことにします。\n最多得票者、同数最多者に投票していなかった場合は\n能力は発動しません。",
    "achievements": [
      {
        "id": "hayatochiri_wolf_assumption_win",
        "name": "直感の人",
        "desc": "早とちりで人狼と決めつけ勝利する。「あなたはきっと人狼に違いない！」"
      },
      {
        "id": "hayatochiri_villager_assumption_loss",
        "name": "そんな…あなたみたいな人が…",
        "desc": "早とちりで村人と決めつけ敗北する。"
      },
      {
        "id": "first_hayatochiri",
        "name": "はじめての早とちり",
        "desc": "初めて早とちりになる。"
      },
      {
        "id": "win_hayatochiri",
        "name": "早とちりで初勝利",
        "desc": "早とちりで勝利する。"
      }
    ],
    "kana": "はやとちり"
  },
  {
    "key": "HUNTER",
    "id": "hunter",
    "name": "ハンター",
    "team": "village",
    "order": 66,
    "desc": "追放道連れ以外で死亡したとき\n選んだプレイヤーを道連れにします。",
    "achievements": [
      {
        "id": "first_hunter",
        "name": "はじめてなった",
        "desc": "初めてハンターになる。"
      },
      {
        "id": "win_hunter",
        "name": "狙いを定めて",
        "desc": "ハンターで勝利する。"
      },
      {
        "id": "hunter_chain_kill",
        "name": "死して狩る者",
        "desc": "ハンターの能力（追放・道連れ以外の死因）で誰かを道連れにすることに成功する。"
      },
      {
        "id": "hunter_chain_village",
        "name": "死してなお村へ牙を剥く",
        "desc": "ハンターで村人陣営を道連れにする。"
      },
      {
        "id": "hunter_chain_nonvillage",
        "name": "死してなお人外を狩る",
        "desc": "ハンターで村人陣営以外を道連れにする。"
      }
    ],
    "kana": "ハンター"
  },
  {
    "key": "NECROMANCER",
    "id": "necromancer",
    "name": "ネクロマンサー",
    "team": "village",
    "order": 67,
    "desc": "自身が生存した状態で村人陣営が勝利した場合、\n敗北している死亡者の中からランダムに1人を\n「死霊」にして勝者に加えます。",
    "achievements": [
      {
        "id": "first_necromancer",
        "name": "死霊術師",
        "desc": "初めてネクロマンサーになる。"
      },
      {
        "id": "win_necromancer",
        "name": "死者への手向け",
        "desc": "ネクロマンサーで勝利する。"
      }
    ],
    "kana": "ネクロマンサー"
  },
  {
    "key": "REN",
    "id": "ren",
    "name": "レン",
    "team": "village",
    "order": 69,
    "desc": "昼能力を3回まで使用でき、\n選んだ相手が初期役職から\n変化しているかしていないかを調べることができます。\n同じ対象に複数使うことも可能です。\nまた、モーゼスに能力を使用した場合\nモーゼスであることが分かります。",
    "achievements": [
      {
        "id": "lose_ren",
        "name": "許してください！足舐めます！",
        "desc": "レンで敗北する。"
      },
      {
        "id": "ren_use_moses",
        "name": "幽霊バイト",
        "desc": "レンでモーゼスに能力を使う。"
      },
      {
        "id": "first_ren",
        "name": "子供ならではの特権だよね〜？",
        "desc": "初めてレンになる。"
      },
      {
        "id": "win_ren",
        "name": "ジュジュシールド！！",
        "desc": "レンで勝利する。"
      }
    ],
    "kana": "レン"
  },
  {
    "key": "SCREW_GUM",
    "id": "screw_gum",
    "name": "スクリューガム",
    "team": "village",
    "order": 65,
    "desc": "試合開始時、初期役職の時点でプレイヤーに\n銀狼がいるかどうかを知ることができます。\n誰が銀狼かは分かりません。\n\nプレイヤーにスクリューガムがいる場合、\n銀狼のハッキング先が村人陣営だったとき、\nハッキングに失敗します。\nただし、役職配布時点で恋人陣営になっている\n村人役職へのハッキングは失敗しません。\n\nまた、ハッキングによってスクリューガムと\n思い込むこともありません。",
    "achievements": [
      {
        "id": "first_screw_gum",
        "name": "天才クラブ#76",
        "desc": "初めてスクリューガムになる。"
      },
      {
        "id": "win_screw_gum",
        "name": "スクリューガムで初勝利",
        "desc": "スクリューガムで勝利する。"
      }
    ],
    "kana": "スクリューガム"
  },
  {
    "key": "TRAP_MASTER",
    "id": "trap_master",
    "name": "罠師",
    "team": "village",
    "order": 70,
    "desc": "夜に選んだプレイヤーに罠を張ります。\n人狼陣営か第三陣営が罠を張られたプレイヤーに\n昼能力を使おうとすると失敗し\n投票権が失われます。",
    "achievements": [
      {
        "id": "first_trap_master",
        "name": "罠の仕掛け人",
        "desc": "初めて罠師になる。"
      },
      {
        "id": "win_trap_master",
        "name": "踏んだら最後",
        "desc": "罠師で勝利する。"
      }
    ],
    "kana": "わなし"
  },
  {
    "key": "ASSASSIN",
    "id": "assassin",
    "name": "アサシン",
    "team": "wolf",
    "order": 78,
    "desc": "吊られるとアサシン会議が始まり、マーリンを当てられれば人狼陣営が逆転勝利します。",
    "achievements": [
      {
        "id": "assassin_miss_merlin",
        "name": "外れた刃",
        "desc": "アサシンでマーリンを外す。"
      },
      {
        "id": "assassin_hit_merlin",
        "name": "マーリンを射抜く刃",
        "desc": "アサシンでマーリンを当てる。"
      },
      {
        "id": "assassin_no_merlin",
        "name": "いない賢者を探して",
        "desc": "アサシン会議時にマーリンが墓地または上書きされている。"
      },
      {
        "id": "first_assassin",
        "name": "影に潜む暗殺者",
        "desc": "初めてアサシンになる。"
      },
      {
        "id": "win_assassin",
        "name": "マーリン狩り",
        "desc": "アサシンで勝利する。"
      }
    ],
    "kana": "アサシン"
  },
  {
    "key": "SAM",
    "id": "sam",
    "name": "サム",
    "team": "wolf",
    "order": 170,
    "desc": "ホタルが変身した姿です。人狼陣営として勝利します。盤面に本物の銀狼がいる場合、銀狼にはサムの存在が通知されます。",
    "achievements": [],
    "kana": "サム"
  },
  {
    "key": "CAT_PUMPKIN",
    "id": "cat_pumpkin",
    "name": "ネコカボチャ",
    "team": "wolf",
    "order": 81,
    "desc": "吊られると他の人狼以外を道連れにして、保安官に撃たれたり番犬に噛まれたらその相手を道連れにします。",
    "achievements": [
      {
        "id": "cat_pumpkin_sheriff_chain",
        "name": "執行への噛み返し",
        "desc": "ネコカボチャで保安官に執行され、保安官を道連れにする。"
      },
      {
        "id": "cat_pumpkin_exile_chain_wolf",
        "name": "ネコカボチャの味方道連れ",
        "desc": "ネコカボチャで追放され人狼陣営を道連れにする。"
      },
      {
        "id": "cat_pumpkin_exile_chain_nonwolf",
        "name": "ネコカボチャの道連れ",
        "desc": "ネコカボチャで追放され人狼陣営以外を道連れにする。"
      },
      {
        "id": "first_cat_pumpkin",
        "name": "かぼちゃ猫の爪",
        "desc": "初めてネコカボチャになる。"
      },
      {
        "id": "win_cat_pumpkin",
        "name": "道連れの収穫祭",
        "desc": "ネコカボチャで勝利する。"
      }
    ],
    "kana": "ネコカボチャ"
  },
  {
    "key": "DARK_AVATAR",
    "id": "dark_avatar",
    "name": "闇の化身",
    "team": "wolf",
    "order": 71,
    "desc": "試合開始時に人狼陣営の役職へランダムに変化します。新聞結果には表示されません。",
    "achievements": [],
    "kana": "やみのけしん"
  },
  {
    "key": "LONE_WOLF",
    "id": "lone_wolf",
    "name": "一匹狼",
    "team": "wolf",
    "order": 74,
    "desc": "相方が分からず、他の人狼からも見えません。",
    "achievements": [
      {
        "id": "first_lone_wolf",
        "name": "孤独な遠吠え",
        "desc": "初めて一匹狼になる。"
      },
      {
        "id": "win_lone_wolf",
        "name": "孤狼の生存術",
        "desc": "一匹狼で勝利する。"
      }
    ],
    "kana": "いっぴきおおかみ"
  },
  {
    "key": "SMOKE_MADMAN",
    "id": "smoke_madman",
    "name": "煙幕の狂人",
    "team": "wolf",
    "order": 107,
    "desc": "昼開始時、煙幕を投げ変化公開以外の昼通知を隠します。\n詳細設定でONの場合は昼能力対象と投票対象の名前も隠します。\n封印されている場合は発動しません。",
    "achievements": [
      {
        "id": "smoke_hid_notice",
        "name": "煙の向こうの通知",
        "desc": "煙幕発動時に本来なら通知される昼通知がある。"
      },
      {
        "id": "first_smoke_madman",
        "name": "煙幕を投げる者",
        "desc": "初めて煙幕の狂人になる。"
      },
      {
        "id": "win_smoke_madman",
        "name": "煙の中の勝利",
        "desc": "煙幕の狂人で勝利する。"
      }
    ],
    "kana": "えんまくのきょうじん"
  },
  {
    "key": "MONKEY_MADMAN",
    "id": "monkey_madman",
    "name": "猿の狂人",
    "team": "wolf",
    "order": 117,
    "desc": "現世にいる間、保安官、ヴァニティ、独裁者、天秤の能力は猿凸状態になり対象がランダムになります。",
    "achievements": [
      {
        "id": "zodiac_monkey_madman",
        "name": "申年",
        "desc": "試合終了時、現世に猿の狂人以外の干支の狂人が存在する。"
      },
      {
        "id": "first_monkey_madman",
        "name": "猿知恵",
        "desc": "初めて猿の狂人になる。"
      },
      {
        "id": "win_monkey_madman",
        "name": "猿も木から勝ち上がる",
        "desc": "猿の狂人で勝利する。"
      }
    ],
    "kana": "さるのきょうじん"
  },
  {
    "key": "OBSERVER_WOLF",
    "id": "observer_wolf",
    "name": "観測の人狼",
    "team": "wolf",
    "order": 82,
    "desc": "昼になると夜に誰が誰に能力を使っていたかが分かります。",
    "achievements": [
      {
        "id": "observer_observed_self",
        "name": "自分への視線",
        "desc": "観測の人狼で自分に能力が使われていると観測する。"
      },
      {
        "id": "first_observer_wolf",
        "name": "夜を観測する狼",
        "desc": "初めて観測の人狼になる。"
      },
      {
        "id": "win_observer_wolf",
        "name": "観測された勝利",
        "desc": "観測の人狼で勝利する。"
      }
    ],
    "kana": "かんそくのじんろう"
  },
  {
    "key": "OX_MADMAN",
    "id": "ox_madman",
    "name": "牛の狂人",
    "team": "wolf",
    "order": 110,
    "desc": "牛の狂人が同数最多投票になった場合、\n同数最多の人はそれぞれ1/2の確率で生き延びます。\n全員が生き残った場合は引き分け、\n全員が死亡した場合は相打ちになります。\n生き残りが2人以上いる場合は引き分け、\n生き残りが1人だけの場合は通常の生存扱いです。\n死亡した人は押し切りになります。",
    "achievements": [
      {
        "id": "zodiac_ox_madman",
        "name": "丑年",
        "desc": "試合終了時、現世に牛の狂人以外の干支の狂人が存在する。"
      },
      {
        "id": "first_ox_madman",
        "name": "猛牛注意",
        "desc": "初めて牛の狂人になる。"
      },
      {
        "id": "win_ox_madman",
        "name": "牛の歩みも千里",
        "desc": "牛の狂人で勝利する。"
      }
    ],
    "kana": "うしのきょうじん"
  },
  {
    "key": "MAD_MAYOR",
    "id": "mad_mayor",
    "name": "狂ったメイヤー",
    "team": "wolf",
    "order": 102,
    "desc": "設定した票数分投票できる狂人です。",
    "achievements": [
      {
        "id": "mad_mayor_vote_wolf",
        "name": "狂った票をご主人へ",
        "desc": "狂ったメイヤーで人狼陣営に投票する。"
      },
      {
        "id": "mad_mayor_vote_nonwolf",
        "name": "狂った票を村へ",
        "desc": "狂ったメイヤーで人狼陣営以外に投票する。"
      },
      {
        "id": "first_mad_mayor",
        "name": "狂った票束",
        "desc": "初めて狂ったメイヤーになる。"
      },
      {
        "id": "win_mad_mayor",
        "name": "狂票の采配",
        "desc": "狂ったメイヤーで勝利する。"
      }
    ],
    "kana": "くるっためいやー"
  },
  {
    "key": "MAD_EXCHANGER",
    "id": "mad_exchanger",
    "name": "狂った交換者",
    "team": "wolf",
    "order": 104,
    "desc": "昼能力で2人を選び、その2人の票数を入れ替えます。狂人系として扱われます。",
    "achievements": [
      {
        "id": "mad_exchanger_swap_vote",
        "name": "狂った票先交換",
        "desc": "狂った交換者で票先を交換する。"
      },
      {
        "id": "mad_exchanger_swap_self",
        "name": "自分も巻き込む狂交換",
        "desc": "狂った交換者で自身と誰かを交換する。"
      },
      {
        "id": "mad_exchanger_swap_others",
        "name": "他人同士の狂交換",
        "desc": "狂った交換者で他人同士を交換する。"
      },
      {
        "id": "first_mad_exchanger",
        "name": "狂った票替え",
        "desc": "初めて狂った交換者になる。"
      },
      {
        "id": "win_mad_exchanger",
        "name": "票を狂わせる勝利",
        "desc": "狂った交換者で勝利する。"
      }
    ],
    "kana": "くるったこうかんしゃ"
  },
  {
    "key": "MAD_QUEEN",
    "id": "mad_queen",
    "name": "狂った女王",
    "team": "wolf",
    "order": 100,
    "desc": "村人目線では女王と同じ通知が出ますが、人狼側には狂った女王として見えます。",
    "achievements": [
      {
        "id": "mad_queen_no_village_votes",
        "name": "偽りの王冠、疑われず",
        "desc": "狂った女王で村人陣営に投票されずに試合を終える。"
      },
      {
        "id": "first_mad_queen",
        "name": "偽りの王冠",
        "desc": "初めて狂った女王になる。"
      },
      {
        "id": "win_mad_queen",
        "name": "王冠に潜む狂気",
        "desc": "狂った女王で勝利する。"
      }
    ],
    "kana": "くるったじょおう"
  },
  {
    "key": "MAD_PRIEST",
    "id": "mad_priest",
    "name": "狂った神官",
    "team": "wolf",
    "order": 108,
    "desc": "狂った神官が生存していると神勝利を無効にする。\n神の祝福は無効にしない。\n狂った神官が死亡していると神が勝利しても、\n人狼陣営が一緒に勝てる。",
    "achievements": [
      {
        "id": "first_mad_priest",
        "name": "狂信の始まり",
        "desc": "初めて狂った神官になる。"
      },
      {
        "id": "win_mad_priest",
        "name": "堕ちた信仰",
        "desc": "狂った神官で勝利する。"
      },
      {
        "id": "mad_priest_god_wolf",
        "name": "歪んだ奇跡",
        "desc": "神の勝利によって人狼陣営を追加勝利させる。"
      }
    ],
    "kana": "くるったしんかん"
  },
  {
    "key": "MAD_SEER",
    "id": "mad_seer",
    "name": "狂った占い師",
    "team": "wolf",
    "order": 93,
    "desc": "占いの能力を持った狂人です。",
    "achievements": [
      {
        "id": "mad_seer_inspect_village",
        "name": "狂眼に映る村",
        "desc": "狂った占い師で村人陣営を占う。"
      },
      {
        "id": "mad_seer_inspect_wolf",
        "name": "狂眼に映る狼",
        "desc": "狂った占い師で人狼陣営を占う。"
      },
      {
        "id": "mad_seer_inspect_third",
        "name": "狂眼に映る第三",
        "desc": "狂った占い師で第三陣営を占う。"
      },
      {
        "id": "mad_seer_curse_fox",
        "name": "狂った呪殺",
        "desc": "狂った占い師で妖狐を呪殺する。"
      },
      {
        "id": "mad_seer_curse_fox_marked",
        "name": "狐憑きの呪殺",
        "desc": "狂った占い師で狐憑きを呪殺する。"
      },
      {
        "id": "mad_seer_inspect_wolf_marked",
        "name": "狼憑きを占う狂眼",
        "desc": "狂った占い師で狼憑きを占う。"
      },
      {
        "id": "first_mad_seer",
        "name": "狂った水晶玉",
        "desc": "初めて狂った占い師になる。"
      },
      {
        "id": "win_mad_seer",
        "name": "嘘も真実も狼のために",
        "desc": "狂った占い師で勝利する。"
      }
    ],
    "kana": "くるったうらないし"
  },
  {
    "key": "CULTIST",
    "id": "cultist",
    "name": "狂信者",
    "team": "wolf",
    "order": 94,
    "desc": "墓地以外の人狼プレイヤーを知っている狂人です。一匹狼は分かりません。特殊な人狼も人狼としてだけ見えます。",
    "achievements": [
      {
        "id": "cultist_becomes_master",
        "name": "新たなご主人",
        "desc": "狂信者で自身がご主人になる。"
      },
      {
        "id": "first_cultist",
        "name": "狼を信じる者",
        "desc": "初めて狂信者になる。"
      },
      {
        "id": "win_cultist",
        "name": "信仰の果てに",
        "desc": "狂信者で勝利する。"
      }
    ],
    "kana": "きょうしんしゃ"
  },
  {
    "key": "MADMAN",
    "id": "madman",
    "name": "狂人",
    "team": "wolf",
    "order": 92,
    "desc": "人狼は見えず、夜行動もありません。",
    "achievements": [
      {
        "id": "madman_vote_master",
        "name": "ご主人への一票",
        "desc": "狂人でご主人に投票する。"
      },
      {
        "id": "madman_voted_by_master",
        "name": "ご主人からの一票",
        "desc": "狂人でご主人に投票される。"
      },
      {
        "id": "first_madman",
        "name": "狂気の芽生え",
        "desc": "初めて狂人になる。"
      },
      {
        "id": "win_madman",
        "name": "ご主人様の勝利",
        "desc": "狂人で勝利する。"
      }
    ],
    "kana": "きょうじん"
  },
  {
    "key": "SILVER_WOLF",
    "id": "silver_wolf",
    "name": "銀狼",
    "team": "wolf",
    "order": 87,
    "desc": "夜にランダムなプレイヤー1人をハッキングします。対象は墓地のランダムな役職を自分の役職と思い込み、その偽能力と偽情報を使用します。本来の投票時能力とパッシブ能力は残ります。ハッキングされていたプレイヤーの本来の役職が怪盗といたずらっ子以外の夜能力役職、または予想屋だった場合は、裏で自動的にランダムな相手へ能力を行使します。",
    "achievements": [
      {
        "id": "lose_silver_wolf",
        "name": "今度こそ私を楽しませてくれる？",
        "desc": "銀狼で初めて敗北する。"
      },
      {
        "id": "silver_wolf_death",
        "name": "アカウントがBANされた",
        "desc": "銀狼で死亡する。"
      },
      {
        "id": "first_silver_wolf",
        "name": "天才ハッカー",
        "desc": "初めて銀狼になる。"
      },
      {
        "id": "win_silver_wolf",
        "name": "このゲーム、いただき♪",
        "desc": "銀狼で勝利する。"
      }
    ],
    "kana": "ぎんろう"
  },
  {
    "key": "ROOSTER_MADMAN",
    "id": "rooster_madman",
    "name": "鶏の狂人",
    "team": "wolf",
    "order": 118,
    "desc": "1票でも入るとショック死します。生存していると、人狼陣営が負けそうな時に逆転勝利させます。チキンも生存している場合は、どちらが逆転させるかは生存数に応じて決まります。",
    "achievements": [
      {
        "id": "zodiac_rooster_madman",
        "name": "酉年",
        "desc": "試合終了時、現世に鶏の狂人以外の干支の狂人が存在する。"
      },
      {
        "id": "first_rooster_madman",
        "name": "鶏小屋の狂騒",
        "desc": "初めて鶏の狂人になる。"
      },
      {
        "id": "win_rooster_madman",
        "name": "朝を告げる頃にはもう遅い",
        "desc": "鶏の狂人で勝利する。"
      }
    ],
    "kana": "にわとりのきょうじん"
  },
  {
    "key": "DOG_MADMAN",
    "id": "dog_madman",
    "name": "犬の狂人",
    "team": "wolf",
    "order": 119,
    "desc": "夜に飼い主を選びます。飼い主に投票した場合は噛み殺し、飼い主に投票しなかった場合は飼い主を吊られないようにします。",
    "achievements": [
      {
        "id": "zodiac_dog_madman",
        "name": "戌年",
        "desc": "試合終了時、現世に犬の狂人以外の干支の狂人が存在する。"
      },
      {
        "id": "first_dog_madman",
        "name": "狂犬注意",
        "desc": "初めて犬の狂人になる。"
      },
      {
        "id": "win_dog_madman",
        "name": "犬も歩けば狂ってる",
        "desc": "犬の狂人で勝利する。"
      }
    ],
    "kana": "いぬのきょうじん"
  },
  {
    "key": "TIGER_MADMAN",
    "id": "tiger_madman",
    "name": "虎の狂人",
    "team": "wolf",
    "order": 111,
    "desc": "吊られた時、生存している第三陣営がいればランダムに1人道連れにします。",
    "achievements": [
      {
        "id": "zodiac_tiger_madman",
        "name": "寅年",
        "desc": "試合終了時、現世に虎の狂人以外の干支の狂人が存在する。"
      },
      {
        "id": "first_tiger_madman",
        "name": "虎視眈々",
        "desc": "初めて虎の狂人になる。"
      },
      {
        "id": "win_tiger_madman",
        "name": "虎の威を借る狂人",
        "desc": "虎の狂人で勝利する。"
      }
    ],
    "kana": "とらのきょうじん"
  },
  {
    "key": "MUZZLE_MADMAN",
    "id": "muzzle_madman",
    "name": "口封じの狂人",
    "team": "wolf",
    "order": 98,
    "desc": "夜の開始時に全プレイヤーの中からランダムな1人を口封じします。口封じされたプレイヤーはチャット、CO、結果開示ができません。",
    "achievements": [
      {
        "id": "muzzle_other",
        "name": "沈黙させる者",
        "desc": "口封じの狂人で他者を口封じする。"
      },
      {
        "id": "muzzle_self",
        "name": "自らを封じる口",
        "desc": "口封じの狂人で自身を口封じする。"
      },
      {
        "id": "first_muzzle_madman",
        "name": "口を閉ざす者",
        "desc": "初めて口封じの狂人になる。"
      },
      {
        "id": "win_muzzle_madman",
        "name": "沈黙の勝利",
        "desc": "口封じの狂人で勝利する。"
      }
    ],
    "kana": "くちふうじのきょうじん"
  },
  {
    "key": "BLACK_WOLF_MADMAN",
    "id": "black_wolf_madman",
    "name": "黒子の狂人",
    "team": "wolf",
    "order": 101,
    "desc": "占い結果が人狼と出る狂人です。",
    "achievements": [
      {
        "id": "black_wolf_madman_inspected",
        "name": "黒子の狼影",
        "desc": "黒子の狂人で占い師に占われる。"
      },
      {
        "id": "first_black_wolf_madman",
        "name": "舞台裏の黒子",
        "desc": "初めて黒子の狂人になる。"
      },
      {
        "id": "win_black_wolf_madman",
        "name": "影から支えた勝利",
        "desc": "黒子の狂人で勝利する。"
      }
    ],
    "kana": "くろこのきょうじん"
  },
  {
    "key": "BLACK_CAT",
    "id": "black_cat",
    "name": "黒猫",
    "team": "wolf",
    "order": 95,
    "desc": "吊られると誰かを道連れにする狂人です。ご主人を道連れにする可能性もあります。",
    "achievements": [
      {
        "id": "black_cat_chain_wolf",
        "name": "黒猫の味方撃ち",
        "desc": "黒猫で人狼陣営を道連れにする。"
      },
      {
        "id": "black_cat_chain_nonwolf",
        "name": "黒猫の爪痕",
        "desc": "黒猫で人狼陣営以外を道連れにする。"
      },
      {
        "id": "first_black_cat",
        "name": "不吉な黒猫",
        "desc": "初めて黒猫になる。"
      },
      {
        "id": "win_black_cat",
        "name": "爪痕を残す勝利",
        "desc": "黒猫で勝利する。"
      }
    ],
    "kana": "くろねこ"
  },
  {
    "key": "TENACIOUS_MADMAN",
    "id": "tenacious_madman",
    "name": "執念の狂人",
    "team": "wolf",
    "order": 105,
    "desc": "人狼陣営が勝利していても、自身が死亡していると敗北します。",
    "achievements": [
      {
        "id": "tenacious_dead_on_wolf_win",
        "name": "執念届かず",
        "desc": "執念の狂人で人狼陣営が勝利したのに自身が死亡している。"
      },
      {
        "id": "first_tenacious_madman",
        "name": "死ねない執念",
        "desc": "初めて執念の狂人になる。"
      },
      {
        "id": "win_tenacious_madman",
        "name": "生きてこその狂気",
        "desc": "執念の狂人で勝利する。"
      }
    ],
    "kana": "しゅうねんのきょうじん"
  },
  {
    "key": "SNAKE_MADMAN",
    "id": "snake_madman",
    "name": "蛇の狂人",
    "team": "wolf",
    "order": 114,
    "desc": "自身が投票した相手が最多得票になった場合、その相手を追放ではなく毒殺します。追放時に発動する能力や護衛を貫通します。封印されている場合は発動しません。",
    "achievements": [
      {
        "id": "zodiac_snake_madman",
        "name": "巳年",
        "desc": "試合終了時、現世に蛇の狂人以外の干支の狂人が存在する。"
      },
      {
        "id": "first_snake_madman",
        "name": "毒牙を隠す者",
        "desc": "初めて蛇の狂人になる。"
      },
      {
        "id": "win_snake_madman",
        "name": "致命の一滴",
        "desc": "蛇の狂人で勝利する。"
      }
    ],
    "kana": "へびのきょうじん"
  },
  {
    "key": "CURSE_WOLF",
    "id": "curse_wolf",
    "name": "呪術の人狼",
    "team": "wolf",
    "order": 89,
    "desc": "自身が投票した相手が最多得票になった場合、その相手を追放ではなく呪殺します。追放時に発動する能力や身代わり、護衛を貫通します。封印されている場合は発動しません。",
    "achievements": [
      {
        "id": "lose_curse_wolf",
        "name": "呪いは変える",
        "desc": "呪術の人狼で初めて敗北する。"
      },
      {
        "id": "curse_wolf_kill",
        "name": "その命、ここで終わりだ。",
        "desc": "呪術の人狼で呪殺を成功させる。"
      },
      {
        "id": "first_curse_wolf",
        "name": "禁断の呪術師",
        "desc": "初めて呪術の人狼になる。"
      },
      {
        "id": "win_curse_wolf",
        "name": "狼の呪詛",
        "desc": "呪術の人狼で勝利する。"
      }
    ],
    "kana": "じゅじゅつのじんろう"
  },
  {
    "key": "MIND_WOLF",
    "id": "mind_wolf",
    "name": "心眼の人狼",
    "team": "wolf",
    "order": 83,
    "desc": "昼能力で対象1人の最終役職を見抜けます。妖狐を見抜いても呪殺しません。",
    "achievements": [
      {
        "id": "mind_wolf_find_village",
        "name": "村の心眼",
        "desc": "心眼の人狼で村人陣営を見抜く。"
      },
      {
        "id": "mind_wolf_find_wolf",
        "name": "狼の心眼",
        "desc": "心眼の人狼で人狼陣営を見抜く。"
      },
      {
        "id": "mind_wolf_find_third",
        "name": "第三の心眼",
        "desc": "心眼の人狼で第三陣営を見抜く。"
      },
      {
        "id": "seen_by_mind_wolf_village",
        "name": "心眼に映る村",
        "desc": "心眼の人狼に村人陣営として見抜かれる。"
      },
      {
        "id": "seen_by_mind_wolf_wolf",
        "name": "心眼に映る狼",
        "desc": "心眼の人狼に人狼陣営として見抜かれる。"
      },
      {
        "id": "seen_by_mind_wolf_third",
        "name": "心眼に映る第三",
        "desc": "心眼の人狼に第三陣営として見抜かれる。"
      },
      {
        "id": "first_mind_wolf",
        "name": "心を覗く牙",
        "desc": "初めて心眼の人狼になる。"
      },
      {
        "id": "win_mind_wolf",
        "name": "正体を見抜く狼",
        "desc": "心眼の人狼で勝利する。"
      }
    ],
    "kana": "しんがんのじんろう"
  },
  {
    "key": "WEREWOLF",
    "id": "werewolf",
    "name": "人狼",
    "team": "wolf",
    "order": 72,
    "desc": "他の人狼を確認できます。一匹狼は見えません。",
    "achievements": [
      {
        "id": "first_werewolf",
        "name": "闇夜の遠吠え",
        "desc": "初めて人狼になる。"
      },
      {
        "id": "win_werewolf",
        "name": "月下の勝利",
        "desc": "人狼で勝利する。"
      },
      {
        "id": "werewolf_no_partner",
        "name": "孤独な遠吠え",
        "desc": "人狼で相方がいないまま試合を終える。"
      }
    ],
    "kana": "じんろう"
  },
  {
    "key": "WOLF_KING",
    "id": "wolf_king",
    "name": "人狼王",
    "team": "wolf",
    "order": 79,
    "desc": "占い・判定・勝利条件は常に人狼として扱われます。昼開始時に公開されます。最終的に自分以外の人狼系役職が存在している場合のみ、最多得票でも処刑されません。人狼王が複数いる場合は互いを他の人狼として扱います。",
    "achievements": [
      {
        "id": "wolf_king_partner_exiled",
        "name": "王の仲間が倒れる",
        "desc": "人狼王で仲間が追放される。"
      },
      {
        "id": "wolf_king_exiled_no_partner",
        "name": "孤王の処刑",
        "desc": "人狼王で仲間がいない状態で追放される。"
      },
      {
        "id": "wolf_king_top_with_partner",
        "name": "王は倒れず",
        "desc": "人狼王で仲間がいる状態で最多得票者になる。"
      },
      {
        "id": "first_wolf_king",
        "name": "王たる牙",
        "desc": "初めて人狼王になる。"
      },
      {
        "id": "win_wolf_king",
        "name": "玉座に残る狼",
        "desc": "人狼王で勝利する。"
      }
    ],
    "kana": "じんろうおう"
  },
  {
    "key": "RAT_MADMAN",
    "id": "rat_madman",
    "name": "鼠の狂人",
    "team": "wolf",
    "order": 109,
    "desc": "昼能力で逃げ込む対象を選びます。逃げ込んだ先が死亡しない限り、投票・噛殺・爆殺などでは死亡しません。ただし保安官やヴァニティには執行されます。逃げ込んだ先が死亡した場合は後追いします。第三陣営に逃げ込んでいた場合は、投票終了時に無条件で後追いします。",
    "achievements": [
      {
        "id": "rat_madman_hide_target_dead",
        "name": "袋の鼠",
        "desc": "鼠の狂人で逃げ込んだ先が死亡する。"
      },
      {
        "id": "rat_madman_hide_cat",
        "name": "窮鼠、猫を噛む",
        "desc": "鼠の狂人で猫又、黒猫、ネコカボチャ、シュレディンガーの猫のいずれかに逃げ込む。"
      },
      {
        "id": "zodiac_rat_madman",
        "name": "子年",
        "desc": "試合終了時、現世に鼠の狂人以外の干支の狂人が存在する。"
      },
      {
        "id": "first_rat_madman",
        "name": "屋根裏の住人",
        "desc": "初めて鼠の狂人になる。"
      },
      {
        "id": "win_rat_madman",
        "name": "一鼠報いる",
        "desc": "鼠の狂人で勝利する。"
      }
    ],
    "kana": "ねずみのきょうじん"
  },
  {
    "key": "BIG_WOLF",
    "id": "big_wolf",
    "name": "大狼",
    "team": "wolf",
    "order": 73,
    "desc": "他の人狼系を確認できます。さらに墓地カードをすべて確認できます。一匹狼は見えません。",
    "achievements": [
      {
        "id": "big_wolf_center_role",
        "name": "墓地を語る大狼",
        "desc": "大狼で墓地にある役職をCO履歴に残す。"
      },
      {
        "id": "first_big_wolf",
        "name": "墓地を覗く狼",
        "desc": "初めて大狼になる。"
      },
      {
        "id": "win_big_wolf",
        "name": "死者を知る支配者",
        "desc": "大狼で勝利する。"
      }
    ],
    "kana": "たいろう"
  },
  {
    "key": "BOAR_MADMAN",
    "id": "boar_madman",
    "name": "猪の狂人",
    "team": "wolf",
    "order": 120,
    "desc": "夜にプレイヤー1人を選びます。投票ではどこを選んでもその相手に投票します。ペンギンや交換者でもこの投票先は変わりません。",
    "achievements": [
      {
        "id": "boar_madman_charge_wolf_judge",
        "name": "俺を止められるやつはどこにもいない",
        "desc": "猪の狂人で人狼判定のプレイヤーに突進する。"
      },
      {
        "id": "zodiac_boar_madman",
        "name": "亥年",
        "desc": "試合終了時、現世に猪の狂人以外の干支の狂人が存在する。"
      },
      {
        "id": "first_boar_madman",
        "name": "猪突猛進",
        "desc": "初めて猪の狂人になる。"
      },
      {
        "id": "win_boar_madman",
        "name": "一直線の勝利",
        "desc": "猪の狂人で勝利する。"
      }
    ],
    "kana": "いのししのきょうじん"
  },
  {
    "key": "RABBIT_MADMAN",
    "id": "rabbit_madman",
    "name": "兎の狂人",
    "team": "wolf",
    "order": 112,
    "desc": "ゲーム開始時にランダムなプレイヤーを草むらへ隠れさせます。兎の狂人は誰が隠れたかを知ります。隠れた本人は気づきません。隠れた相手に夜能力または昼能力を使うと失敗します。",
    "achievements": [
      {
        "id": "zodiac_rabbit_madman",
        "name": "卯年",
        "desc": "試合終了時、現世に兎の狂人以外の干支の狂人が存在する。"
      },
      {
        "id": "first_rabbit_madman",
        "name": "草むらの住人",
        "desc": "初めて兎の狂人になる。"
      },
      {
        "id": "win_rabbit_madman",
        "name": "脱兎のごとく",
        "desc": "兎の狂人で勝利する。"
      }
    ],
    "kana": "うさぎのきょうじん"
  },
  {
    "key": "COMMAND_WOLF",
    "id": "command_wolf",
    "name": "統率の人狼",
    "team": "wolf",
    "order": 88,
    "desc": "夜に墓地以外の人狼系、初期役職の狂人系、一匹狼、スパイ、妖狸を見分けることができます。墓地にいる役職は見えません。",
    "achievements": [
      {
        "id": "command_wolf_checked_mad",
        "name": "全員、配置につけ。",
        "desc": "統率の人狼で狂人系を確認する。"
      },
      {
        "id": "command_wolf_checked_lone",
        "name": "孤高の牙も戦力だ。",
        "desc": "統率の人狼で一匹狼を確認する。"
      },
      {
        "id": "command_wolf_checked_fake",
        "name": "偽りは見逃さない",
        "desc": "統率の人狼でスパイまたは妖狸を確認する。"
      },
      {
        "id": "first_command_wolf",
        "name": "狼を束ねる者",
        "desc": "初めて統率の人狼になる。"
      },
      {
        "id": "win_command_wolf",
        "name": "群れを束ねる牙",
        "desc": "統率の人狼で勝利する。"
      }
    ],
    "kana": "とうそつのじんろう"
  },
  {
    "key": "TOFU_WOLF",
    "id": "tofu_wolf",
    "name": "豆腐の人狼",
    "team": "wolf",
    "order": 76,
    "desc": "1票でも投票されると追放されてしまう人狼です。",
    "achievements": [
      {
        "id": "tofu_mental_break",
        "name": "豆腐メンタル崩壊",
        "desc": "豆腐の人狼でメンタル崩壊する。"
      },
      {
        "id": "tofu_mapo_complete",
        "name": "麻婆豆腐完成",
        "desc": "豆腐の人狼で麻婆豆腐を完成させる。"
      },
      {
        "id": "first_tofu_wolf",
        "name": "ぷるぷるメンタル",
        "desc": "初めて豆腐の人狼になる。"
      },
      {
        "id": "win_tofu_wolf",
        "name": "崩れぬ豆腐",
        "desc": "豆腐の人狼で勝利する。"
      }
    ],
    "kana": "とうふのじんろう"
  },
  {
    "key": "JESTER_MADMAN",
    "id": "jester_madman",
    "name": "道化の狂人",
    "team": "wolf",
    "order": 106,
    "desc": "追放または道連れで死亡した場合、人狼が1人以上死んでいても人狼陣営勝利になります。しかし道化の狂人自身が人狼判定に昇格したうえでつられた場合は人狼陣営は敗北します。",
    "achievements": [
      {
        "id": "jester_madman_reverse",
        "name": "道化の逆転劇",
        "desc": "道化の狂人で人狼判定が死亡していたが自身が追放されたことで逆転する。"
      },
      {
        "id": "first_jester_madman",
        "name": "道化の火種",
        "desc": "初めて道化の狂人になる。"
      },
      {
        "id": "win_jester_madman",
        "name": "最後に笑う道化",
        "desc": "道化の狂人で勝利する。"
      }
    ],
    "kana": "どうけのきょうじん"
  },
  {
    "key": "NEGI_WOLF",
    "id": "negi_wolf",
    "name": "葱の人狼",
    "team": "wolf",
    "order": 90,
    "desc": "豆腐の人狼と同時にいると冷奴が完成し、豆腐の人狼は1票でメンタル崩壊しません。冷奴完成後に葱の人狼が死亡すると、豆腐の人狼が生存者全員をメンタル崩壊させます。",
    "achievements": [
      {
        "id": "first_negi_wolf",
        "name": "薬味の相棒",
        "desc": "初めて葱の人狼になる。"
      },
      {
        "id": "win_negi_wolf",
        "name": "葱は添えるだけ",
        "desc": "葱の人狼で勝利する。"
      }
    ],
    "kana": "ねぎのじんろう"
  },
  {
    "key": "HORSE_MADMAN",
    "id": "horse_madman",
    "name": "馬の狂人",
    "team": "wolf",
    "order": 115,
    "desc": "現世にいる間、馬の狂人以外は一度投票した先から投票先を変更できません。",
    "achievements": [
      {
        "id": "zodiac_horse_madman",
        "name": "午年",
        "desc": "試合終了時、現世に馬の狂人以外の干支の狂人が存在する。"
      },
      {
        "id": "first_horse_madman",
        "name": "暴れ馬",
        "desc": "初めて馬の狂人になる。"
      },
      {
        "id": "win_horse_madman",
        "name": "勝ち馬に乗る",
        "desc": "馬の狂人で勝利する。"
      },
      {
        "id": "horse_madman_coffee",
        "name": "馬ルクト",
        "desc": "馬の狂人でコーヒーを受け取る。"
      }
    ],
    "kana": "うまのきょうじん"
  },
  {
    "key": "WHITE_WOLF",
    "id": "white_wolf",
    "name": "白狼",
    "team": "wolf",
    "order": 75,
    "desc": "占い結果が村人と出る人狼です。相方や狂信者からは人狼として見えます。",
    "achievements": [
      {
        "id": "white_wolf_inspected",
        "name": "白く見える影",
        "desc": "白狼で占い師に占われる。"
      },
      {
        "id": "first_white_wolf",
        "name": "白き狼の仮面",
        "desc": "初めて白狼になる。"
      },
      {
        "id": "win_white_wolf",
        "name": "疑われぬ牙",
        "desc": "白狼で勝利する。"
      }
    ],
    "kana": "はくろう"
  },
  {
    "key": "REBEL_MADMAN",
    "id": "rebel_madman",
    "name": "反逆の狂人",
    "team": "wolf",
    "order": 99,
    "desc": "独裁が発動したとき、生存しているなら独裁者本人を代わりに処刑します。",
    "achievements": [
      {
        "id": "rebel_coup",
        "name": "クーデター成功",
        "desc": "反逆の狂人でクーデターを起こす。"
      },
      {
        "id": "first_rebel_madman",
        "name": "反逆の火種",
        "desc": "初めて反逆の狂人になる。"
      },
      {
        "id": "win_rebel_madman",
        "name": "クーデター成功",
        "desc": "反逆の狂人で勝利する。"
      }
    ],
    "kana": "はんぎゃくのきょうじん"
  },
  {
    "key": "SEAL_MADMAN",
    "id": "seal_madman",
    "name": "封印の狂人",
    "team": "wolf",
    "order": 103,
    "desc": "夜の最初に1人を選び、その相手のさまざまな能力や通知を封印します。",
    "achievements": [
      {
        "id": "seal_fail_village",
        "name": "村を封じる",
        "desc": "封印の狂人で村人陣営を封印して失敗させる。"
      },
      {
        "id": "seal_fail_wolf",
        "name": "狼を封じる",
        "desc": "封印の狂人で人狼陣営を封印して失敗させる。"
      },
      {
        "id": "seal_fail_third",
        "name": "第三を封じる",
        "desc": "封印の狂人で第三陣営を封印して失敗させる。"
      },
      {
        "id": "first_seal_madman",
        "name": "封印の印",
        "desc": "初めて封印の狂人になる。"
      },
      {
        "id": "win_seal_madman",
        "name": "能力封じの勝利",
        "desc": "封印の狂人で勝利する。"
      }
    ],
    "kana": "ふういんのきょうじん"
  },
  {
    "key": "FORGETFUL_WOLF",
    "id": "forgetful_wolf",
    "name": "忘却の人狼",
    "team": "wolf",
    "order": 77,
    "desc": "自分のことを村人だと思い込んでいる人狼です。占い結果は人狼です。本人視点では村人として夜を認識します。",
    "achievements": [
      {
        "id": "forgetful_vote_wolf",
        "name": "忘れた仲間への一票",
        "desc": "忘却の人狼で人狼陣営に投票する。"
      },
      {
        "id": "first_forgetful_wolf",
        "name": "忘れた牙",
        "desc": "初めて忘却の人狼になる。"
      },
      {
        "id": "win_forgetful_wolf",
        "name": "思い出さぬまま勝利",
        "desc": "忘却の人狼で勝利する。"
      }
    ],
    "kana": "ぼうきゃくのじんろう"
  },
  {
    "key": "EXPOSED_MADMAN",
    "id": "exposed_madman",
    "name": "暴露狂人",
    "team": "wolf",
    "order": 97,
    "desc": "夜に1人選びます。昼開始時に、その相手の最終役職だけが全体公開されます。対象名や暴露狂人本人は公開されません。恋人陣営や酔っぱらいならその情報も追加で公開されます。",
    "achievements": [
      {
        "id": "exposed_reveal_village",
        "name": "村を暴く",
        "desc": "暴露狂人で村人陣営役職を暴露する。"
      },
      {
        "id": "exposed_reveal_wolf",
        "name": "狼を暴く",
        "desc": "暴露狂人で人狼陣営役職を暴露する。"
      },
      {
        "id": "exposed_reveal_third",
        "name": "第三を暴く",
        "desc": "暴露狂人で第三陣営役職を暴露する。"
      },
      {
        "id": "exposed_reveal_lover",
        "name": "恋を暴く",
        "desc": "暴露狂人で恋人陣営を暴露する。"
      },
      {
        "id": "exposed_reveal_queen",
        "name": "王冠を暴く",
        "desc": "暴露狂人で女王を暴露する。"
      },
      {
        "id": "first_exposed_madman",
        "name": "暴きたがりの狂気",
        "desc": "初めて暴露狂人になる。"
      },
      {
        "id": "win_exposed_madman",
        "name": "暴露が招いた勝利",
        "desc": "暴露狂人で勝利する。"
      }
    ],
    "kana": "ばくろきょうじん"
  },
  {
    "key": "MAPO_WOLF",
    "id": "mapo_wolf",
    "name": "麻婆の人狼",
    "team": "wolf",
    "order": 80,
    "desc": "盤面にいる間、豆腐の人狼は1票追放ではなく最多得票時にのみ処刑され、さらに2票持ちとして数えられます。",
    "achievements": [
      {
        "id": "mapo_no_tofu",
        "name": "豆腐不在の麻婆",
        "desc": "麻婆の人狼で豆腐の人狼がいないまま試合を終える。"
      },
      {
        "id": "mapo_complete",
        "name": "完成する麻婆豆腐",
        "desc": "麻婆の人狼で麻婆豆腐を完成させる。"
      },
      {
        "id": "first_mapo_wolf",
        "name": "辛味の相方探し",
        "desc": "初めて麻婆の人狼になる。"
      },
      {
        "id": "win_mapo_wolf",
        "name": "麻婆豆腐完成",
        "desc": "麻婆の人狼で勝利する。"
      }
    ],
    "kana": "まーぼーのじんろう"
  },
  {
    "key": "ERASER_WOLF",
    "id": "eraser_wolf",
    "name": "抹消の人狼",
    "team": "wolf",
    "order": 85,
    "desc": "夜に選んだ対象の役職と重複役を昼開始時に抹消します。人狼系は人狼、狂人系は狂人、村人陣営と第三陣営は村人になります。対象がロックされている場合は失敗します。",
    "achievements": [
      {
        "id": "eraser_target_village",
        "name": "平凡への帰還",
        "desc": "抹消の人狼で村人陣営を対象にする。"
      },
      {
        "id": "eraser_target_plain_villager",
        "name": "そこには何もなかった",
        "desc": "抹消の人狼で元々村人の相手を対象にする。"
      },
      {
        "id": "eraser_target_wolf",
        "name": "原点回帰",
        "desc": "抹消の人狼で人狼陣営を対象にする。"
      },
      {
        "id": "eraser_target_third",
        "name": "例外は認めない",
        "desc": "抹消の人狼で第三陣営を対象にする。"
      },
      {
        "id": "eraser_target_lover",
        "name": "破局師の親戚",
        "desc": "抹消の人狼で恋人状態の相手を対象にする。"
      },
      {
        "id": "first_eraser_wolf",
        "name": "魔法のイレイサー",
        "desc": "初めて抹消の人狼になる。"
      },
      {
        "id": "win_eraser_wolf",
        "name": "抹消完了",
        "desc": "抹消の人狼で勝利する。"
      }
    ],
    "kana": "まっしょうのじんろう"
  },
  {
    "key": "MIMIC_WOLF",
    "id": "mimic_wolf",
    "name": "模倣の人狼",
    "team": "wolf",
    "order": 84,
    "desc": "盤面か墓地にある村人・人狼・狂人系の初期役職から能力を模倣する人狼です。",
    "achievements": [
      {
        "id": "mimic_copy_village",
        "name": "村の能力をまとう狼",
        "desc": "模倣の人狼で村人陣営能力を模倣する。"
      },
      {
        "id": "mimic_copy_wolf",
        "name": "狼の能力をまとう狼",
        "desc": "模倣の人狼で人狼陣営能力を模倣する。"
      },
      {
        "id": "mimic_sheriff_execute_village",
        "name": "偽りの執行",
        "desc": "模倣保安官で村人陣営を執行する。"
      },
      {
        "id": "mimic_chicken_reverse",
        "name": "狼の臆病な逆転",
        "desc": "模倣チキンで人狼陣営を逆転させる。"
      },
      {
        "id": "first_mimic_wolf",
        "name": "まねる狼",
        "desc": "初めて模倣の人狼になる。"
      },
      {
        "id": "win_mimic_wolf",
        "name": "借り物の牙で勝利",
        "desc": "模倣の人狼で勝利する。"
      },
      {
        "id": "mimic_sheriff_execute_queen",
        "name": "敵国に執行された女王",
        "desc": "女王を模倣保安官能力で執行する。"
      }
    ],
    "kana": "もほうのじんろう"
  },
  {
    "key": "SHEEP_MADMAN",
    "id": "sheep_madman",
    "name": "羊の狂人",
    "team": "wolf",
    "order": 116,
    "desc": "昼能力で1人を迷える子羊状態にし、その人の投票先をランダムにします。人狼陣営に能力を使った場合は、自身の票もランダムになります。",
    "achievements": [
      {
        "id": "zodiac_sheep_madman",
        "name": "未年",
        "desc": "試合終了時、現世に羊の狂人以外の干支の狂人が存在する。"
      },
      {
        "id": "first_sheep_madman",
        "name": "迷える子羊",
        "desc": "初めて羊の狂人になる。"
      },
      {
        "id": "win_sheep_madman",
        "name": "群れに紛れた狂気",
        "desc": "羊の狂人で勝利する。"
      }
    ],
    "kana": "ひつじのきょうじん"
  },
  {
    "key": "DRAGON_MADMAN",
    "id": "dragon_madman",
    "name": "龍の狂人",
    "team": "wolf",
    "order": 113,
    "desc": "夜能力を使われた瞬間、誰のどの役職が自分の逆鱗に触れたかを知ります。",
    "achievements": [
      {
        "id": "zodiac_dragon_madman",
        "name": "辰年",
        "desc": "試合終了時、現世に龍の狂人以外の干支の狂人が存在する。"
      },
      {
        "id": "first_dragon_madman",
        "name": "龍の逆鱗",
        "desc": "初めて龍の狂人になる。"
      },
      {
        "id": "win_dragon_madman",
        "name": "天翔ける龍",
        "desc": "龍の狂人で勝利する。"
      }
    ],
    "kana": "りゅうのきょうじん"
  },
  {
    "key": "MIRAGE_WOLF",
    "id": "mirage_wolf",
    "name": "蜃気狼",
    "team": "wolf",
    "order": 86,
    "desc": "占い師・指読み・心眼の人狼・感覚の占い師からは、盤面にあり得るランダムな役職に見えます。自分が何に見えるかは分かりません。墓地でも発動し、偽占い師からは必ず蜃気狼に見えます。",
    "achievements": [
      {
        "id": "lose_mirage_wolf",
        "name": "蜃気楼の終息",
        "desc": "蜃気狼で初めて敗北する。"
      },
      {
        "id": "mirage_wolf_inspected",
        "name": "幻影工作",
        "desc": "蜃気狼で指読み、占い師、感覚の占い師のいずれかに確認される。"
      },
      {
        "id": "mirage_wolf_fake_seer",
        "name": "幻影をすり抜ける偽の水晶",
        "desc": "蜃気狼で偽占い師に占われる。"
      },
      {
        "id": "first_mirage_wolf",
        "name": "揺らめく幻想",
        "desc": "初めて蜃気狼になる。"
      },
      {
        "id": "win_mirage_wolf",
        "name": "蜃気楼の使い手",
        "desc": "蜃気狼で勝利する。"
      }
    ],
    "kana": "しんきろう"
  },
  {
    "key": "CRAZY_DONUT_SHOP",
    "id": "crazy_donut_shop",
    "name": "狂ったドーナツ屋",
    "team": "wolf",
    "order": 96,
    "desc": "昼開始時ドーナツ屋を除く\nランダムなプレイヤー1人に粗悪なドーナツを届けます。\nドーナツは1人1回までしか受け取れず\nドーナツ屋自身もドーナツを受け取ることが出来ないので\n他に届ける相手がいなかった場合\n届けられず自分の元に戻ってきます。",
    "achievements": [
      {
        "id": "crazy_donut_shop_loss",
        "name": "返品はお断りです",
        "desc": "狂ったドーナツ屋で敗北する。"
      },
      {
        "id": "first_crazy_donut_shop",
        "name": "ライバル店を潰せ",
        "desc": "初めて狂ったドーナツ屋になる。"
      },
      {
        "id": "win_crazy_donut_shop",
        "name": "粗悪品の流通成功",
        "desc": "狂ったドーナツ屋で勝利する。"
      }
    ],
    "kana": "くるったどーなつや"
  },
  {
    "key": "MAD_AGITATOR",
    "id": "mad_agitator",
    "name": "狂った煽動者",
    "team": "wolf",
    "order": 121,
    "desc": "夜に煽るプレイヤーを1人選択します。\n煽られたプレイヤーは投票される票数が1票加算されます。",
    "achievements": [
      {
        "id": "mad_agitator_loss",
        "name": "虚ろな演説",
        "desc": "狂った煽動者で敗北する。"
      },
      {
        "id": "mad_agitator_self_play",
        "name": "自作自演",
        "desc": "狂った煽動者で自身に煽動したうえで人狼判定に昇格して勝利する。"
      },
      {
        "id": "first_mad_agitator",
        "name": "純粋な狂気",
        "desc": "初めて狂った煽動者になる。"
      },
      {
        "id": "win_mad_agitator",
        "name": "狂気の誘導",
        "desc": "狂った煽動者で勝利する。"
      }
    ],
    "kana": "くるったせんどうしゃ"
  },
  {
    "key": "PATCH",
    "id": "patch",
    "name": "パッチ",
    "team": "wolf",
    "order": 91,
    "desc": "相方の人狼がいないとき自動で\n墓地の役職と自身の役職を交換させます。\n相方がいる場合は交換できません。\n見えている他の人狼が\n妖狸とスパイだけの場合も交換できません。",
    "achievements": [
      {
        "id": "first_patch",
        "name": "あんた聞こえないのか？降参だと言ってるじゃ無いか！",
        "desc": "初めてパッチになる。"
      },
      {
        "id": "win_patch",
        "name": "へへへっありがとよそれ開けられなくて困ってたんだ",
        "desc": "パッチで勝利する。"
      },
      {
        "id": "lose_patch",
        "name": "…ま、待ってくれ！降参！降参だ！",
        "desc": "パッチで敗北する。"
      },
      {
        "id": "patch_steal_wolf",
        "name": "…そりゃあ、いつかこうなるわなクソったれが…",
        "desc": "パッチの能力を発動し、墓地から人狼系役職を奪う。"
      }
    ],
    "kana": "パッチ"
  },
  {
    "key": "VANITY",
    "id": "vanity",
    "name": "ヴァニティ",
    "team": "third",
    "order": 156,
    "desc": "自分を保安官だと思い込んでいます。昼能力で保安官のように撃てます。人外を撃った場合は村人陣営が勝てば追加勝利し、村人陣営を撃った場合は自分の正体を知り、村人陣営が敗北すれば追加勝利します。撃たなかった場合は敗北します。",
    "achievements": [
      {
        "id": "vanity_fake_justice",
        "name": "偽りの正義",
        "desc": "ヴァニティで村人陣営を撃ち、村人陣営が敗北して勝利する。"
      },
      {
        "id": "vanity_second_sheriff",
        "name": "二代目保安官",
        "desc": "ヴァニティで人外を撃ち、村人陣営と共に勝利する。"
      },
      {
        "id": "vanity_shoot_sheriff",
        "name": "正義は一人でいい",
        "desc": "ヴァニティで保安官を撃つ。"
      },
      {
        "id": "first_vanity",
        "name": "胸に宿る正義",
        "desc": "初めてヴァニティになる。"
      }
    ],
    "kana": "ヴァニティ"
  },
  {
    "key": "ELFRINDE",
    "id": "elfrinde",
    "name": "エルフリンデ",
    "team": "third",
    "order": 168,
    "desc": "夜にプレイヤー1人を封印します。封印されたプレイヤーは、その試合中能力を使用できません。\n封印した相手が人外だった場合は、村人陣営勝利時に追加勝利します。\n封印した相手が村人陣営だった場合は悪魔に精神を侵食され、村人陣営が敗北すると追加勝利します。\n侵食されたことは本人には分かりません。",
    "achievements": [
      {
        "id": "elfrinde_seal_outsider",
        "name": "教皇の使命",
        "desc": "エルフリンデで人外に封印能力を使用する。"
      },
      {
        "id": "elfrinde_corrupted",
        "name": "堕ちた教皇",
        "desc": "エルフリンデで村人陣営を封印し、悪魔に精神を乗っ取られる。"
      },
      {
        "id": "sealed_by_elfrinde_village",
        "name": "ほう、貴様、我に気づいてるな。",
        "desc": "村人陣営としてエルフリンデに封印される。"
      },
      {
        "id": "first_elfrinde",
        "name": "聖槍の魔女",
        "desc": "初めてエルフリンデになる。"
      },
      {
        "id": "win_elfrinde",
        "name": "Ⅰ.THE LANCE",
        "desc": "エルフリンデで勝利する。"
      }
    ],
    "kana": "エルフリンデ"
  },
  {
    "key": "OPPORTUNIST",
    "id": "opportunist",
    "name": "オポチュニスト",
    "team": "third",
    "order": 126,
    "desc": "最後まで死ななければ追加勝利です。",
    "achievements": [
      {
        "id": "opportunist_only_dead",
        "name": "ただ一人の死",
        "desc": "オポチュニストで自分だけ死亡する。"
      },
      {
        "id": "opportunist_with_village",
        "name": "村と機会を掴む",
        "desc": "オポチュニストで村人陣営と共に勝つ。"
      },
      {
        "id": "opportunist_with_wolf",
        "name": "狼と機会を掴む",
        "desc": "オポチュニストで人狼陣営と共に勝つ。"
      },
      {
        "id": "opportunist_with_third",
        "name": "第三と機会を掴む",
        "desc": "オポチュニストで第三陣営と共に勝つ。"
      },
      {
        "id": "opportunist_god_loss",
        "name": "祝福に乗れない機会",
        "desc": "オポチュニストで神の祝福により敗北する。"
      },
      {
        "id": "first_opportunist",
        "name": "好機を待つ者",
        "desc": "初めてオポチュニストになる。"
      },
      {
        "id": "win_opportunist",
        "name": "機会を掴んだ者",
        "desc": "オポチュニストで勝利する。"
      }
    ],
    "kana": "オポチュニスト"
  },
  {
    "key": "CUPID",
    "id": "cupid",
    "name": "キューピッド",
    "team": "third",
    "order": 139,
    "desc": "夜に2人を選び、その2人に新しい恋人関係を追加します。選んだ恋人たちが勝利し、かつ誰も吊られていなければ、キューピッド本人が吊られていても追加勝利します。",
    "achievements": [
      {
        "id": "first_cupid",
        "name": "恋の矢を放つ者",
        "desc": "初めてキューピッドになる。"
      },
      {
        "id": "win_cupid",
        "name": "恋人たちの勝利",
        "desc": "キューピッドで勝利する。"
      }
    ],
    "kana": "キューピッド"
  },
  {
    "key": "GREMLIN",
    "id": "gremlin",
    "name": "グレムリン",
    "team": "third",
    "order": 136,
    "desc": "夜に2人のプレイヤーを選び、1人目の役職を2人目にコピーします。コピー元は変化せず、選んだ2人のうちどちらかが最終的に勝利すれば追加勝利します。",
    "achievements": [
      {
        "id": "gremlin_copy_village",
        "name": "村を写す悪戯",
        "desc": "グレムリンで村人陣営をコピーする。"
      },
      {
        "id": "gremlin_copy_wolf",
        "name": "狼を写す悪戯",
        "desc": "グレムリンで人狼陣営をコピーする。"
      },
      {
        "id": "gremlin_copy_third",
        "name": "第三を写す悪戯",
        "desc": "グレムリンで第三陣営をコピーする。"
      },
      {
        "id": "gremlin_copy_dependency_despair",
        "name": "絶望のコピー",
        "desc": "グレムリンでフリーター、従者、反転者を就職先やご主人、反転先ごとコピーする。"
      },
      {
        "id": "first_gremlin",
        "name": "コピー開始",
        "desc": "初めてグレムリンになる。"
      },
      {
        "id": "win_gremlin",
        "name": "借り物の勝利",
        "desc": "グレムリンで勝利する。"
      },
      {
        "id": "gremlin_copy_copied_doppel",
        "name": "コピーのコピー",
        "desc": "別役職をコピー済みのドッペルゲンガーをコピーする。"
      },
      {
        "id": "gremlin_copy_loser",
        "name": "敗北の感染",
        "desc": "グレムリンで負け組をコピーする。"
      }
    ],
    "kana": "グレムリン"
  },
  {
    "key": "CHESED",
    "id": "chesed",
    "name": "ケセド",
    "team": "third",
    "order": 162,
    "desc": "夜に1人を占い、その結果とコーヒーを自分以外の誰かへ渡します。ケセド自身は結果を知りません。コーヒーを渡された人が勝利すると勝利します。\nケセドとコーヒーを渡された人はコーヒータイムのため、議論時間の1/3が経過するまでCOと発言ができません。",
    "achievements": [
      {
        "id": "first_chesed",
        "name": "コーヒータイム",
        "desc": "初めてケセドになる。"
      },
      {
        "id": "win_chesed",
        "name": "MOROSITAS",
        "desc": "ケセドで勝利する。"
      },
      {
        "id": "lose_chesed",
        "name": "カフェイン中毒",
        "desc": "ケセドで敗北する。"
      }
    ],
    "kana": "ケセド"
  },
  {
    "key": "SHUFFLER",
    "id": "shuffler",
    "name": "シャッフラー",
    "team": "third",
    "order": 141,
    "desc": "夜に自身または他のプレイヤーを1人選び、\n一部を除いたランダムな役職へ変化させます。\n変化させたプレイヤーはシャッフラー陣営になります。\n\n自身を変化させた場合は変化後の役職として勝利すれば単独勝利。\n他者を変化させた場合は変化させたプレイヤーが\n変化後の役職として勝利すれば\nシャッフラーと変化させたプレイヤー共に乗っ取り勝利します。\n\nただし、追放されたり死亡しないと勝てない\n役職以外に変化させた場合に\n変化させた対象が死亡すると\nシャッフラー陣営は勝利条件を満たせません。\n\nまた、他者を変化させたとき\n変化させた役職が村人陣営か人狼陣営だった場合は\nシャッフラー本人だけ死亡しても\nシャッフラー陣営は勝利条件を満たせません。\n\n神の祝福時は乗っ取らず一緒に勝利します。",
    "achievements": [
      {
        "id": "shuffler_self",
        "name": "自分をシャッフル",
        "desc": "シャッフラーで自身をシャッフルする。"
      },
      {
        "id": "shuffler_other",
        "name": "他者をシャッフル",
        "desc": "シャッフラーで他者をシャッフルする。"
      },
      {
        "id": "first_shuffler",
        "name": "混沌の配役者",
        "desc": "初めてシャッフラーになる。"
      },
      {
        "id": "win_shuffler",
        "name": "運命を書き換える者",
        "desc": "シャッフラーで勝利する。"
      }
    ],
    "kana": "シャッフラー"
  },
  {
    "key": "SCHRODINGER_CAT",
    "id": "schrodinger_cat",
    "name": "シュレディンガーの猫",
    "team": "third",
    "order": 134,
    "desc": "投票後、自分に投票していた人の中からランダムに選ばれた人の陣営になり、その陣営が勝利していれば追加勝利します。",
    "achievements": [
      {
        "id": "schrodinger_no_team",
        "name": "箱の中の無所属",
        "desc": "シュレディンガーの猫で陣営に所属できない。"
      },
      {
        "id": "schrodinger_team_lost",
        "name": "選ばれた陣営の敗北",
        "desc": "シュレディンガーの猫で所属した陣営が敗北する。"
      },
      {
        "id": "schrodinger_sheriff_village",
        "name": "保安官が開けた村の箱",
        "desc": "シュレディンガーの猫で保安官に撃たれて村人陣営に所属する。"
      },
      {
        "id": "first_schrodinger_cat",
        "name": "箱の中の猫",
        "desc": "初めてシュレディンガーの猫になる。"
      },
      {
        "id": "win_schrodinger_cat",
        "name": "観測された勝者",
        "desc": "シュレディンガーの猫で勝利する。"
      }
    ],
    "kana": "しゅれでぃんがーのねこ"
  },
  {
    "key": "TANNER",
    "id": "tanner",
    "name": "てるてる坊主",
    "team": "third",
    "order": 123,
    "desc": "自分が処刑されると勝利です。",
    "achievements": [
      {
        "id": "first_tanner",
        "name": "首を吊られる準備",
        "desc": "初めててるてる坊主になる。"
      },
      {
        "id": "win_tanner",
        "name": "吊られて本望",
        "desc": "てるてる坊主で勝利する。"
      },
      {
        "id": "tanner_multi_exile_win",
        "name": "混戦のてるてる",
        "desc": "てるてる坊主で2人以上追放されたうえで勝利する。"
      }
    ],
    "kana": "てるてるぼうず"
  },
  {
    "key": "NANOKA",
    "id": "nanoka",
    "name": "なのか",
    "team": "third",
    "order": 163,
    "desc": "夜に長夜月、三月なのか、羅刹のいずれかを選んで変化します。\nロックや封印で選べなかった場合は勝利できません。\n長夜月：ランダムな他プレイヤー1人に長夜を付与し、その人に投票されたうえで死亡すれば追加勝利します。\n三月なのか：昼能力「写真撮影」で対象の陣営を調べ、その相手が村人の気配だったら追加勝利します。\n羅刹：ランダムなプレイヤー1人に愛する人を付与し、愛する人が死亡すれば追加勝利します。",
    "achievements": [
      {
        "id": "first_long_night_moon",
        "name": "長夜の月",
        "desc": "初めて長夜月になる。"
      },
      {
        "id": "first_mitsuki_nanoka",
        "name": "六相氷",
        "desc": "初めて三月なのかになる。"
      },
      {
        "id": "first_rasetsu",
        "name": "安らかに眠れ",
        "desc": "初めて羅刹になる。"
      },
      {
        "id": "win_long_night_moon",
        "name": "「忘却」はアナタの行く末を守っている",
        "desc": "長夜月で勝利する。"
      },
      {
        "id": "win_mitsuki_nanoka",
        "name": "ハイ、チーズ!",
        "desc": "三月なのかで勝利する。"
      },
      {
        "id": "win_rasetsu",
        "name": "今からウチは羅刹だよ～",
        "desc": "羅刹で勝利する。"
      }
    ],
    "kana": "なのか"
  },
  {
    "key": "BALANCER",
    "id": "balancer",
    "name": "バランサー",
    "team": "third",
    "order": 145,
    "desc": "投票結果で2人以上に票が入り、票が入った全員の票数が同じだった場合に単独勝利します。追加勝利系が条件を満たしている場合は一緒に勝てます。",
    "achievements": [
      {
        "id": "balancer_no_vote_loss",
        "name": "均衡を忘れて",
        "desc": "バランサーで投票し忘れて敗北する。"
      },
      {
        "id": "first_balancer",
        "name": "均衡を望む者",
        "desc": "初めてバランサーになる。"
      },
      {
        "id": "win_balancer",
        "name": "完璧な均衡",
        "desc": "バランサーで勝利する。"
      }
    ],
    "kana": "バランサー"
  },
  {
    "key": "FREETER",
    "id": "freeter",
    "name": "フリーター",
    "team": "third",
    "order": 128,
    "desc": "夜に1人を選んで就職します。就職先が勝利したら自分も追加勝利します。",
    "achievements": [
      {
        "id": "freeter_reemployed_after_death",
        "name": "議論中の再就職",
        "desc": "フリーターで就職先が議論中に死亡し別のプレイヤーに再就職する。"
      },
      {
        "id": "first_freeter",
        "name": "就職先募集中",
        "desc": "初めてフリーターになる。"
      },
      {
        "id": "win_freeter",
        "name": "就職先に恵まれて",
        "desc": "フリーターで勝利する。"
      },
      {
        "id": "freeter_reemployed",
        "name": "転職しました！",
        "desc": "フリーターで再就職する。"
      }
    ],
    "kana": "フリーター"
  },
  {
    "key": "PERSONA",
    "id": "persona",
    "name": "ペルソナ",
    "team": "third",
    "order": 175,
    "desc": "現世にいるランダムな役職の仮面を被りその役職を演じます。\n占われるとその演じた役職として見えます。\n演じた役職の能力は使えません。\n演じた役職のプレイヤーが勝利していれば追加勝利します。\n演じている役職が上書きによりいなくなっていた場合敗北します。",
    "achievements": [
      {
        "id": "first_persona",
        "name": "もう一人の自分",
        "desc": "初めてペルソナになる。"
      },
      {
        "id": "win_persona",
        "name": "我は汝、汝は我",
        "desc": "ペルソナで勝利する。"
      },
      {
        "id": "persona_stolen_by_robber",
        "name": "心の怪盗団",
        "desc": "怪盗にペルソナを盗まれる。"
      }
    ],
    "kana": "ペルソナ"
  },
  {
    "key": "HOTARU",
    "id": "hotaru",
    "name": "ホタル",
    "team": "third",
    "order": 169,
    "desc": "夜にサムへ変身するかを選びます。変身しない場合はホタルのまま村人の気配として扱われ、盤面に開拓者がいれば昼通知で誰が開拓者か分かります。封印されている場合はサムに変身できず、開拓者を知ることもできません。",
    "achievements": [
      {
        "id": "first_sam",
        "name": "焦土作戦実行",
        "desc": "初めてサムになる。"
      },
      {
        "id": "win_sam",
        "name": "あなたたちの旅を終わらせたのは、星核ハンターだと",
        "desc": "サムで勝利する。"
      },
      {
        "id": "first_hotaru",
        "name": "ロスト・エントロピー症候群",
        "desc": "初めてホタルになる。"
      },
      {
        "id": "win_hotaru",
        "name": "ホタルよ、生きるために死ぬのだと",
        "desc": "ホタルで勝利する。"
      }
    ],
    "kana": "ホタル"
  },
  {
    "key": "MATTHIAS",
    "id": "matthias",
    "name": "マティアス",
    "team": "third",
    "order": 159,
    "desc": "夜にプレイヤー1人を娘ちゃんにします。マティアスが死亡しそうな時、娘ちゃんが生存していれば娘ちゃんを犠牲にして死亡を回避します。マティアスと娘ちゃんが両方生存している場合、または娘ちゃんを犠牲にして死亡を回避した場合に追加勝利します。",
    "achievements": [
      {
        "id": "first_matthias",
        "name": "蜘蛛の巣の親方",
        "desc": "初めてマティアスになる。"
      },
      {
        "id": "first_daughter",
        "name": "蜘蛛の巣の子方",
        "desc": "初めて娘ちゃんになる。"
      },
      {
        "id": "matthias_family",
        "name": "家族団欒",
        "desc": "マティアスと娘ちゃんが両方生存して追加勝利する。"
      },
      {
        "id": "matthias_daughter_sacrifice",
        "name": "家族の為なら痛くない",
        "desc": "娘ちゃんとしてマティアスの犠牲になる。"
      },
      {
        "id": "matthias_loss",
        "name": "赤い点",
        "desc": "マティアスで敗北する。"
      }
    ],
    "kana": "マティアス"
  },
  {
    "key": "EVIL_WOMAN",
    "id": "evil_woman",
    "name": "悪女",
    "team": "third",
    "order": 138,
    "desc": "夜に本命1人とキープ1人を選び、自分と本命に新しい恋人関係を追加します。キープは恋人にはなりません。",
    "achievements": [
      {
        "id": "evil_keep_vote",
        "name": "キープへの一票",
        "desc": "悪女でキープに投票する。"
      },
      {
        "id": "evil_voted_by_keep",
        "name": "キープからの一票",
        "desc": "悪女でキープに投票される。"
      },
      {
        "id": "evil_voted_by_main",
        "name": "本命からの一票",
        "desc": "悪女で本命に投票される。"
      },
      {
        "id": "first_evil_woman",
        "name": "本命とキープ",
        "desc": "初めて悪女になる。"
      },
      {
        "id": "win_evil_woman",
        "name": "悪女の恋愛成就",
        "desc": "悪女で勝利する。"
      }
    ],
    "kana": "あくじょ"
  },
  {
    "key": "LOVE_TANNER",
    "id": "love_tanner",
    "name": "一目惚れしてるてる",
    "team": "third",
    "order": 124,
    "desc": "夜に1人選び、自分が処刑されたらその相手も一緒に処刑扱いになり、自分と相手が勝利します。",
    "achievements": [
      {
        "id": "love_tanner_no_target",
        "name": "一目惚れしない夜",
        "desc": "一目惚れしてるてるで一目惚れしない。"
      },
      {
        "id": "first_love_tanner",
        "name": "一目惚れ",
        "desc": "初めて一目惚れしてるてるになる。"
      },
      {
        "id": "win_love_tanner",
        "name": "愛と追放の結末",
        "desc": "一目惚れしてるてるで勝利する。"
      }
    ],
    "kana": "ひとめぼれしてるてる"
  },
  {
    "key": "SILVER_SHADOW",
    "id": "silver_shadow",
    "name": "銀色の影",
    "team": "third",
    "order": 122,
    "desc": "試合開始時に第三陣営の役職へランダムに変化します。ドッペルゲンガーになることもあります。新聞結果には表示されません。",
    "achievements": [],
    "kana": "ぎんいろのかげ"
  },
  {
    "key": "BEGGAR",
    "id": "beggar",
    "name": "乞食",
    "team": "third",
    "order": 157,
    "desc": "最初に死亡したプレイヤーの役職を盗みます。\n乞食に盗まれたプレイヤーは村人になります。\nその対象が生存または死亡が勝利条件に含まれる\n役職だった場合はスルーします。\n乞食のままだった場合でも勝利条件は失われず、\n死亡していれば追加勝利します。\nただし保安官、壊滅開拓者、それらの模倣による\n執行や爆殺で死亡した場合は勝利できません。",
    "achievements": [
      {
        "id": "beggar_become_village",
        "name": "今日から更生します",
        "desc": "乞食で村人陣営の役職と交換する。"
      },
      {
        "id": "beggar_become_wolf",
        "name": "拾い食い厳禁",
        "desc": "乞食で人狼陣営の役職と交換する。"
      },
      {
        "id": "beggar_become_third",
        "name": "食えればなんでもいい",
        "desc": "乞食で第三陣営の役職と交換する。"
      },
      {
        "id": "beggar_failed",
        "name": "空き缶だけだった",
        "desc": "乞食の交換に失敗する。"
      },
      {
        "id": "first_beggar",
        "name": "明日の飯はどこだ",
        "desc": "初めて乞食になる。"
      },
      {
        "id": "win_beggar",
        "name": "お恵みありがとうございます。",
        "desc": "乞食で勝利する。"
      }
    ],
    "kana": "こじき"
  },
  {
    "key": "MITSUKI_NANOKA",
    "id": "mitsuki_nanoka",
    "name": "三月なのか",
    "team": "third",
    "order": 164,
    "desc": "昼能力で写真撮影を行い、対象の陣営を確認できます。撮影相手が村人の気配なら追加勝利します。",
    "achievements": [],
    "kana": "みつきなのか"
  },
  {
    "key": "THREAD_SPINNER",
    "id": "thread_spinner",
    "name": "糸紡ぎ",
    "team": "third",
    "order": 172,
    "desc": "夜にプレイヤー2人を選び、ペア状態にします。\nペアの片方が死亡すると、もう片方は1/2の確率で後追いし、糸紡ぎも後追いします。\nペアがどちらも生存していれば、糸紡ぎは単独勝利します。\nペアが黄泉や抹消の人狼で消された場合、糸紡ぎは敗北します。",
    "achievements": [
      {
        "id": "thread_spinner_loss",
        "name": "はさみは怖い",
        "desc": "糸紡ぎで敗北する。"
      },
      {
        "id": "thread_pair_follow_victim",
        "name": "巻き込まれた糸巻き巻き",
        "desc": "ペアにされた状態で後追い死亡する。"
      },
      {
        "id": "thread_pair_removed",
        "name": "糸はほどかれた",
        "desc": "作ったペアを黄泉または抹消の人狼に消される。"
      },
      {
        "id": "first_thread_spinner",
        "name": "運命を紡ぐ者",
        "desc": "初めて糸紡ぎになる。"
      },
      {
        "id": "win_thread_spinner",
        "name": "強固な糸",
        "desc": "糸紡ぎで勝利する。"
      }
    ],
    "kana": "いとつむぎ"
  },
  {
    "key": "SERVANT",
    "id": "servant",
    "name": "従者",
    "team": "third",
    "order": 129,
    "desc": "試合開始時にランダムなご主人に仕えます。ご主人が勝利したら自分も追加勝利します。",
    "achievements": [
      {
        "id": "servant_substitute",
        "name": "身代わりの従者",
        "desc": "従者でご主人の身代わりになる。"
      },
      {
        "id": "servant_authority_master",
        "name": "私こそが主様だ（？）",
        "desc": "姫君、女王、狂った女王、人狼王、魔界公爵、またはそれらを模倣した模倣の人狼の従者になる。"
      },
      {
        "id": "first_servant",
        "name": "ご主人様を求めて",
        "desc": "初めて従者になる。"
      },
      {
        "id": "win_servant",
        "name": "忠義の報酬",
        "desc": "従者で勝利する。"
      },
      {
        "id": "servant_shield_queen",
        "name": "王国の盾",
        "desc": "女王を保安官の執行から身代わりで守る。"
      }
    ],
    "kana": "じゅうしゃ"
  },
  {
    "key": "MARTYR",
    "id": "martyr",
    "name": "殉職者",
    "team": "third",
    "order": 151,
    "desc": "最終的に死亡していれば追加勝利します。",
    "achievements": [
      {
        "id": "martyr_survived",
        "name": "殉職ならず",
        "desc": "殉職者で死なずに試合を終える。"
      },
      {
        "id": "martyr_god_loss",
        "name": "祝福に届かぬ殉職",
        "desc": "殉職者で神の祝福により敗北する。"
      },
      {
        "id": "first_martyr",
        "name": "死に場所を求めて",
        "desc": "初めて殉職者になる。"
      },
      {
        "id": "win_martyr",
        "name": "名誉ある殉職",
        "desc": "殉職者で勝利する。"
      }
    ],
    "kana": "じゅんしょくしゃ"
  },
  {
    "key": "PURE_LOVER",
    "id": "pure_lover",
    "name": "純愛者",
    "team": "third",
    "order": 137,
    "desc": "夜に1人を選び、自分とその相手に新しい恋人関係を追加します。複数の恋人関係を同時に持てます。",
    "achievements": [
      {
        "id": "first_pure_lover",
        "name": "純愛の始まり",
        "desc": "初めて純愛者になる。"
      },
      {
        "id": "win_pure_lover",
        "name": "愛を貫いた勝利",
        "desc": "純愛者で勝利する。"
      }
    ],
    "kana": "じゅんあいしゃ"
  },
  {
    "key": "EXECUTIONER",
    "id": "executioner",
    "name": "処刑人",
    "team": "third",
    "order": 135,
    "desc": "開始時にランダムなターゲットが選ばれ、その人が吊られれば勝利します。夜に自分のターゲットが表示されます。ターゲットがてるてる系だった場合はそのてるてる系と一緒に勝利します。",
    "achievements": [
      {
        "id": "first_executioner",
        "name": "はじめての処刑人",
        "desc": "初めて処刑人になる。"
      },
      {
        "id": "win_executioner",
        "name": "処刑人で初勝利",
        "desc": "処刑人で勝利する。"
      }
    ],
    "kana": "しょけいにん"
  },
  {
    "key": "WINNER",
    "id": "winner",
    "name": "勝ち組",
    "team": "third",
    "order": 130,
    "desc": "最終的にこの役職であるプレイヤーは追加勝利します。途中で勝ち組になった人は追加勝利確定です。恋人になっていても最終的に勝ち組なら、恋人が敗北しても勝ち組のみ勝利します。",
    "achievements": [
      {
        "id": "winner_changed_loss",
        "name": "勝ち組だったはず",
        "desc": "元々勝ち組だったのに役職が変わっていて敗北する。"
      },
      {
        "id": "winner_from_other_win",
        "name": "後天的勝ち組",
        "desc": "元々別役職だったのに勝ち組になって勝利する。"
      },
      {
        "id": "winner_lover_loss_win",
        "name": "恋に負けても勝ち組",
        "desc": "恋人として負けたのに勝ち組として勝つ。"
      },
      {
        "id": "first_winner",
        "name": "勝ち馬に乗る者",
        "desc": "初めて勝ち組になる。"
      },
      {
        "id": "win_winner",
        "name": "生まれながらの勝者",
        "desc": "勝ち組で勝利する。"
      },
      {
        "id": "gremlin_copy_winner",
        "name": "勝ち組3人組",
        "desc": "グレムリンで勝ち組をコピーする。"
      }
    ],
    "kana": "かちぐみ"
  },
  {
    "key": "WAGERER",
    "id": "wagerer",
    "name": "勝負師",
    "team": "third",
    "order": 174,
    "desc": "昼能力で、どの陣営または単独第三陣営が勝利するかを予想します。村人陣営か人狼陣営を当てると追加勝利し、単独第三陣営を当てると乗っ取り単独勝利します。昼時間中なら予想を何度でも変更できます。",
    "achievements": [
      {
        "id": "wagerer_additional_win",
        "name": "賭けの的中",
        "desc": "勝負師で村人陣営または人狼陣営の勝利を的中させ、追加勝利する。"
      },
      {
        "id": "wagerer_solo_win",
        "name": "オールイン",
        "desc": "勝負師で単独第三陣営の勝利を的中させ、乗っ取り単独勝利する。"
      },
      {
        "id": "first_wagerer",
        "name": "運命に賭ける者",
        "desc": "初めて勝負師になる。"
      }
    ],
    "kana": "しょうぶし"
  },
  {
    "key": "BOUNTY_HUNTER",
    "id": "bounty_hunter",
    "name": "賞金稼ぎ",
    "team": "third",
    "order": 142,
    "desc": "自分が死亡したとき、自分以外の1人を選びます。選んだ相手が最終的に人狼系または昇格した狂人なら勝利します。",
    "achievements": [
      {
        "id": "bounty_no_living_wolf",
        "name": "賞金首不在",
        "desc": "賞金稼ぎで生存者に人狼系がいない。"
      },
      {
        "id": "first_bounty_hunter",
        "name": "賞金首を追う者",
        "desc": "初めて賞金稼ぎになる。"
      },
      {
        "id": "win_bounty_hunter",
        "name": "賞金獲得",
        "desc": "賞金稼ぎで勝利する。"
      }
    ],
    "kana": "しょうきんかせぎ"
  },
  {
    "key": "GOD",
    "id": "god",
    "name": "神",
    "team": "third",
    "order": 125,
    "desc": "全員の初期役職と墓地の役職を知っています。\n処刑されなければ神の勝利です。\n処刑されると神の祝福が発生し、一部の例外を除く全員が勝利します。\n生存している神官または狂った神官がいる場合、神の単独勝利は発生しません。\n死亡している神官がいる場合は村人陣営を、死亡している狂った神官がいる場合は人狼陣営を追加勝利させます。\n他のプレイヤーの役職を神として暴露することは禁止です。",
    "achievements": [
      {
        "id": "god_blessing",
        "name": "神の祝福",
        "desc": "神の祝福を発動する。"
      },
      {
        "id": "first_god",
        "name": "神、降臨",
        "desc": "初めて神になる。"
      },
      {
        "id": "win_god",
        "name": "神の祝福",
        "desc": "神で勝利する。"
      }
    ],
    "kana": "かみ"
  },
  {
    "key": "WATCHER",
    "id": "watcher",
    "name": "静観者",
    "team": "third",
    "order": 155,
    "desc": "誰にも能力を使われず、誰からも票を入れられなければ単独勝利します。ただし、他に追加勝利の条件を満たしているプレイヤーがいる場合は敗北します。静観者の役職は交換やコピーされることはありません。交換されそうになったとき他のプレイヤーの役職と交換させます。",
    "achievements": [
      {
        "id": "watcher_touched",
        "name": "静観できぬ視線",
        "desc": "静観者で能力を使われる。"
      },
      {
        "id": "watcher_voted",
        "name": "静観者への一票",
        "desc": "静観者で投票を入れられる。"
      },
      {
        "id": "watcher_extra_winner_exists",
        "name": "静かな勝利を阻む者",
        "desc": "静観者で追加勝利している人がいる試合に参加する。"
      },
      {
        "id": "watcher_center_of_attention",
        "name": "注目の的",
        "desc": "静観者で1回の試合中に能力を使われ、投票も入れられ、追加勝利している人もいる。"
      },
      {
        "id": "watcher_god_loss",
        "name": "祝福の外側",
        "desc": "静観者で神の祝福により敗北する。"
      },
      {
        "id": "first_watcher",
        "name": "ただ見つめる者",
        "desc": "初めて静観者になる。"
      },
      {
        "id": "win_watcher",
        "name": "誰にも気づかれず",
        "desc": "静観者で勝利する。"
      }
    ],
    "kana": "せいかんしゃ"
  },
  {
    "key": "AGENT",
    "id": "agent",
    "name": "代行者",
    "team": "third",
    "order": 167,
    "desc": "昼開始時にランダムな指令を受けます。指令を達成すると追加勝利します。封印されている場合も指令は下されますが、内容は分かりません。",
    "achievements": [
      {
        "id": "agent_loss",
        "name": "絶縁",
        "desc": "代行者で敗北する。"
      },
      {
        "id": "first_agent",
        "name": "神託代行者",
        "desc": "初めて代行者になる。"
      },
      {
        "id": "win_agent",
        "name": "無我夢中、阿鼻叫喚、支離滅裂",
        "desc": "代行者で勝利する。"
      }
    ],
    "kana": "だいこうしゃ"
  },
  {
    "key": "LONG_NIGHT_MOON",
    "id": "long_night_moon",
    "name": "長夜月",
    "team": "third",
    "order": 165,
    "desc": "ランダムな他プレイヤーに長夜を付与します。長夜が付いた人に投票され、かつ死亡すると追加勝利します。",
    "achievements": [],
    "kana": "ながよづき"
  },
  {
    "key": "AMANOJAKU",
    "id": "amanojaku",
    "name": "天邪鬼",
    "team": "third",
    "order": 127,
    "desc": "村人陣営が勝たなければ追加勝利です。",
    "achievements": [
      {
        "id": "amanojaku_god_loss",
        "name": "祝福に逆らえず",
        "desc": "天邪鬼で神の祝福により敗北する。"
      },
      {
        "id": "first_amanojaku",
        "name": "逆らう者",
        "desc": "初めて天邪鬼になる。"
      },
      {
        "id": "win_amanojaku",
        "name": "逆張り成功",
        "desc": "天邪鬼で勝利する。"
      }
    ],
    "kana": "あまのじゃく"
  },
  {
    "key": "JESTER_BOMBER",
    "id": "jester_bomber",
    "name": "道化の爆弾魔",
    "team": "third",
    "order": 148,
    "desc": "吊られると追加勝利し、自分に投票していた人を敗北させます。",
    "achievements": [
      {
        "id": "bomber_with_village",
        "name": "村と爆ぜる",
        "desc": "道化の爆弾魔で村人陣営と勝利する。"
      },
      {
        "id": "bomber_with_wolf",
        "name": "狼と爆ぜる",
        "desc": "道化の爆弾魔で人狼陣営と勝利する。"
      },
      {
        "id": "bomber_with_third",
        "name": "第三と爆ぜる",
        "desc": "道化の爆弾魔で第三陣営と勝利する。"
      },
      {
        "id": "bomber_explode_all_others",
        "name": "全員爆破",
        "desc": "道化の爆弾魔で他の全員を爆発させる。"
      },
      {
        "id": "first_jester_bomber",
        "name": "爆弾を抱える道化",
        "desc": "初めて道化の爆弾魔になる。"
      },
      {
        "id": "win_jester_bomber",
        "name": "最後の大爆発",
        "desc": "道化の爆弾魔で勝利する。"
      }
    ],
    "kana": "どうけのばくだんま"
  },
  {
    "key": "HEARTBREAKER",
    "id": "heartbreaker",
    "name": "破局師",
    "team": "third",
    "order": 140,
    "desc": "夜に1人を選びます。対象が恋人陣営・悪女本人・悪女の本命なら、昼になる直前に恋人関係を解除して追加勝利します。悪女のキープや恋人でない相手を選ぶと失敗です。",
    "achievements": [
      {
        "id": "heartbreaker_success",
        "name": "破局成功",
        "desc": "破局師で破局に成功する。"
      },
      {
        "id": "heartbreaker_fail",
        "name": "破局失敗",
        "desc": "破局師で破局に失敗する。"
      },
      {
        "id": "heartbreaker_own_lover",
        "name": "自分の恋を壊す",
        "desc": "破局師で自身の恋人相手に破局能力を使う。"
      },
      {
        "id": "first_heartbreaker",
        "name": "愛を壊す者",
        "desc": "初めて破局師になる。"
      },
      {
        "id": "win_heartbreaker",
        "name": "破局成立",
        "desc": "破局師で勝利する。"
      }
    ],
    "kana": "はきょくし"
  },
  {
    "key": "FANATIC",
    "id": "fanatic",
    "name": "背徳者",
    "team": "third",
    "order": 144,
    "desc": "夜に妖狐の気配として妖狐を確認できます。妖狐がいない場合は昼開始時に狂人へ変化します。妖狐が呪殺されると背徳者も勝利条件と投票権を失います。",
    "achievements": [
      {
        "id": "fanatic_follow_curse",
        "name": "呪殺の後追い",
        "desc": "背徳者でご主人が呪殺されて後追いする。"
      },
      {
        "id": "fanatic_to_madman",
        "name": "狂人へ堕ちる背徳",
        "desc": "背徳者から狂人に変化する。"
      },
      {
        "id": "first_fanatic",
        "name": "狐に仕える者",
        "desc": "初めて背徳者になる。"
      },
      {
        "id": "win_fanatic",
        "name": "ご主人様との勝利",
        "desc": "背徳者で勝利する。"
      }
    ],
    "kana": "はいとくしゃ"
  },
  {
    "key": "REVERSER",
    "id": "reverser",
    "name": "反転者",
    "team": "third",
    "order": 153,
    "desc": "選んだプレイヤーに反転を付与し、\n反転がついたことはその人にも通知されます。\n反転が奇数回ついている場合は元の役職として敗北すれば、\n反転が偶数回ついている場合元の役職として勝利すれば\nその反転者と反転をつけたプレイヤーが追加勝利します。\n反転者同士がお互いを反転させている場合はどちらも敗北します。",
    "achievements": [
      {
        "id": "reverser_reversed_but_original_win",
        "name": "反転したのに表の勝利",
        "desc": "反転者で反転した対象が元の役職として勝ってしまう。"
      },
      {
        "id": "reverser_mutual",
        "name": "反転者同士のねじれ",
        "desc": "反転者同士がお互いを反転させる。"
      },
      {
        "id": "reversed_once",
        "name": "反転を受ける",
        "desc": "反転をつけられる。"
      },
      {
        "id": "reversed_even",
        "name": "偶数反転",
        "desc": "反転を偶数回つけられる。"
      },
      {
        "id": "first_reverser",
        "name": "勝敗を反転する者",
        "desc": "初めて反転者になる。"
      },
      {
        "id": "win_reverser",
        "name": "敗北から生まれた勝利",
        "desc": "反転者で勝利する。"
      }
    ],
    "kana": "はんてんしゃ"
  },
  {
    "key": "LOSER",
    "id": "loser",
    "name": "負け組",
    "team": "third",
    "order": 131,
    "desc": "最終的にこの役職であるプレイヤーは敗北します。途中で負け組になった人は敗北確定です。恋人になっていても最終的に負け組なら、恋人が勝利しても負け組のみ敗北します。",
    "achievements": [
      {
        "id": "loser_changed_win",
        "name": "負け組だったはず",
        "desc": "元々負け組だったのに役職が変わっていて勝利する。"
      },
      {
        "id": "loser_from_other_loss",
        "name": "後天的負け組",
        "desc": "元々別役職だったのに負け組になって敗北する。"
      },
      {
        "id": "loser_lover_win_loss",
        "name": "恋に勝っても負け組",
        "desc": "恋人として勝ったのに負け組として敗北する。"
      },
      {
        "id": "loser_god_loss",
        "name": "祝福でも負け組",
        "desc": "負け組で神の祝福により敗北する。"
      },
      {
        "id": "first_loser",
        "name": "負けを背負う者",
        "desc": "初めて負け組になる。"
      }
    ],
    "kana": "まけぐみ"
  },
  {
    "key": "AVENGER",
    "id": "avenger",
    "name": "復讐者",
    "team": "third",
    "order": 146,
    "desc": "夜に選んだ相手が敗北すると追加勝利します。\nしかし復讐者がお互いを復讐相手にしていたり、\n役職交換やコピーによる影響で自身が復讐対象になっている場合は敗北します。",
    "achievements": [
      {
        "id": "avenger_target_won",
        "name": "果たせぬ復讐",
        "desc": "復讐者で復讐相手が勝利する。"
      },
      {
        "id": "first_avenger",
        "name": "復讐相手を定める",
        "desc": "初めて復讐者になる。"
      },
      {
        "id": "win_avenger",
        "name": "復讐完遂",
        "desc": "復讐者で勝利する。"
      }
    ],
    "kana": "ふくしゅうしゃ"
  },
  {
    "key": "LAWYER",
    "id": "lawyer",
    "name": "弁護士",
    "team": "third",
    "order": 154,
    "desc": "開始時に依頼人を知ります。依頼人が勝利し、弁護士が生存していれば単独勝利、死亡していれば追加勝利します。ただし保安官執行死では勝てません。",
    "achievements": [
      {
        "id": "lawyer_extra_win",
        "name": "死してなお弁護",
        "desc": "弁護士で追加勝利する。"
      },
      {
        "id": "lawyer_solo_win",
        "name": "生存弁護の勝利",
        "desc": "弁護士で単独勝利する。"
      },
      {
        "id": "lawyer_client_dead",
        "name": "失われた依頼人",
        "desc": "弁護士で依頼人が死亡する。"
      },
      {
        "id": "lawyer_to_opportunist",
        "name": "依頼なき機会主義",
        "desc": "弁護士からオポチュニストに変化する。"
      },
      {
        "id": "first_lawyer",
        "name": "弁護を始めます",
        "desc": "初めて弁護士になる。"
      },
      {
        "id": "win_lawyer",
        "name": "依頼人の無罪証明",
        "desc": "弁護士で勝利する。"
      },
      {
        "id": "lawyer_client_moved",
        "name": "依頼人変更",
        "desc": "役職交換によって依頼人が別プレイヤーへ移動する。"
      }
    ],
    "kana": "べんごし"
  },
  {
    "key": "DEMON_DUKE",
    "id": "demon_duke",
    "name": "魔界公爵",
    "team": "third",
    "order": 150,
    "desc": "魔界公爵は初期役職の人狼が誰かを知っています。\n投票終了時に1人以上人狼が死亡している、または最初から人狼がいないうえで魔界公爵が生存していると、魔界公爵追放会議が始まり、魔界公爵を処刑できなければ魔界公爵の勝利になります。\n追放会議に参加できるのは生存者のみです。\n追放会議開始時の生存者が魔界公爵のみだった場合は即座に勝利します。",
    "achievements": [
      {
        "id": "demon_no_wolf_start",
        "name": "狼なき魔界",
        "desc": "魔界公爵で最初から人狼判定がいない試合に参加する。"
      },
      {
        "id": "demon_tie_win",
        "name": "同数の魔界勝利",
        "desc": "魔界公爵追放会議が同数で勝利する。"
      },
      {
        "id": "demon_tie_loss",
        "name": "同数の魔界敗北",
        "desc": "魔界公爵追放会議が同数で敗北する。"
      },
      {
        "id": "demon_no_wolf_exiled",
        "name": "狼は吊れず",
        "desc": "魔界公爵で人狼系を吊れない試合になる。"
      },
      {
        "id": "first_demon_duke",
        "name": "魔界より来た公爵",
        "desc": "初めて魔界公爵になる。"
      },
      {
        "id": "win_demon_duke",
        "name": "魔界の支配者",
        "desc": "魔界公爵で勝利する。"
      },
      {
        "id": "demon_duke_misjudgment",
        "name": "魔界の誤審",
        "desc": "魔界公爵追放会議で魔界公爵以外が追放される。"
      }
    ],
    "kana": "まかいこうしゃく"
  },
  {
    "key": "MAGICIAN",
    "id": "magician",
    "name": "魔法使い",
    "team": "third",
    "order": 173,
    "desc": "怪盗、墓荒らし、コスプレイヤー、ドッペルゲンガー、乞食、サム、シャッフラーなど、自身の役職を変えたプレイヤーの変化後役職を奪います。奪われた相手は村人になります。魔法使いのままだった場合でも、生存していれば追加勝利します。",
    "achievements": [
      {
        "id": "magician_loss",
        "name": "魔法の失敗",
        "desc": "魔法使いで敗北する。"
      },
      {
        "id": "first_magician",
        "name": "入れ替えの魔法",
        "desc": "初めて魔法使いになる。"
      },
      {
        "id": "win_magician",
        "name": "他人の役で取る勝利",
        "desc": "魔法使いで勝利する。"
      }
    ],
    "kana": "まほうつかい"
  },
  {
    "key": "MAGICAL_GIRL",
    "id": "magical_girl",
    "name": "魔法少女",
    "team": "third",
    "order": 158,
    "desc": "昼開始時点で人狼系・狂人系がいない場合は闇堕ちして人狼判定になります。人狼や狂人がいる場合は村人陣営として勝利し、闇堕ちした場合は人狼陣営として勝利します。",
    "achievements": [
      {
        "id": "first_magical_girl",
        "name": "愛と正義の名の元に魔法少女がやってくる！",
        "desc": "初めて魔法少女になる。"
      },
      {
        "id": "magical_girl_village_win",
        "name": "アルカナ〜スレイブ！！",
        "desc": "魔法少女で村人陣営として勝利する。"
      },
      {
        "id": "magical_girl_village_loss",
        "name": "愛では誰も救えない",
        "desc": "魔法少女で村人陣営として敗北する。"
      },
      {
        "id": "magical_girl_dark_win",
        "name": "憎しみの女王",
        "desc": "闇堕ちした魔法少女で人狼陣営として勝利する。"
      },
      {
        "id": "magical_girl_dark_loss",
        "name": "愛と憎しみの名の元に",
        "desc": "闇堕ちした魔法少女で人狼陣営として敗北する。"
      }
    ],
    "kana": "まほうしょうじょ"
  },
  {
    "key": "DAUGHTER",
    "id": "daughter",
    "name": "娘ちゃん",
    "team": "third",
    "order": 160,
    "desc": "マティアスによって選ばれた内部専用役職です。直接配役することはできません。",
    "achievements": [],
    "kana": "むすめちゃん"
  },
  {
    "key": "DETECTIVE",
    "id": "detective",
    "name": "名探偵",
    "team": "third",
    "order": 149,
    "desc": "投票終了時、自分を除く全プレイヤーの役職を当てることができれば単独勝利します。",
    "achievements": [
      {
        "id": "detective_partial_loss",
        "name": "惜しい推理",
        "desc": "名探偵で1人以上当てているが敗北する。"
      },
      {
        "id": "detective_no_hit",
        "name": "迷探偵",
        "desc": "名探偵で誰の役職も当たっていない。"
      },
      {
        "id": "first_detective",
        "name": "推理開始",
        "desc": "初めて名探偵になる。"
      },
      {
        "id": "win_detective",
        "name": "真実はひとつ",
        "desc": "名探偵で勝利する。"
      },
      {
        "id": "detective_duo_win",
        "name": "東と西の名探偵",
        "desc": "2人以上の名探偵が同時に勝利する。"
      },
      {
        "id": "detective_smoke_win",
        "name": "煙の中の名推理",
        "desc": "煙幕が発動した試合で名探偵が勝利する。"
      }
    ],
    "kana": "めいたんてい"
  },
  {
    "key": "PRANKSTER",
    "id": "prankster",
    "name": "愉快犯",
    "team": "third",
    "order": 147,
    "desc": "夜に1人選びます。選ばれた相手を基準に、以下のいずれかの1つの勝利条件がランダムで適用されます。\n\n選んだ人が敗北したら追加勝利。\n選んだ人が敗北したら単独勝利。\n選んだ人が敗北したら全員敗北。\n選んだ人が敗北したら全員勝利。\n選んだ人が敗北したら選んだ人だけ勝利\n選んだ人が敗北したら選んだ人以外全員勝利\n選んだ人が敗北したら愉快犯以外全員勝利\n\n選んだ人が勝利したら追加勝利。\n選んだ人が勝利したら単独勝利。\n選んだ人が勝利したら全員敗北\n選んだ人が勝利したら全員勝利\n選んだ人が勝利したら選んだ人だけ勝利\n選んだ人が勝利したら選んだ人以外全員勝利\n選んだ人が勝利したら愉快犯以外全員勝利\n\nどの条件になるかは愉快犯本人にも分かりません。\n愉快犯が2人以上いる場合は誰か1人の条件が共有されて適用されます。 ",
    "achievements": [
      {
        "id": "first_prankster",
        "name": "混乱を望む者",
        "desc": "初めて愉快犯になる。"
      },
      {
        "id": "win_prankster",
        "name": "笑うのは私だけ",
        "desc": "愉快犯で勝利する。"
      }
    ],
    "kana": "ゆかいはん"
  },
  {
    "key": "PREDICTOR",
    "id": "predictor",
    "name": "予想屋",
    "team": "third",
    "order": 152,
    "desc": "昼に最終的に死亡するプレイヤーを何人でも選べます。最終死亡者全員と完全に一致すると単独勝利します。",
    "achievements": [
      {
        "id": "predictor_one_dead_win",
        "name": "ただ一人の予想",
        "desc": "予想屋で1人だけ死亡すると予想して勝利する。"
      },
      {
        "id": "predictor_all_dead_win",
        "name": "全滅予報",
        "desc": "予想屋で全員死亡すると予想して勝利する。"
      },
      {
        "id": "predictor_too_few",
        "name": "少なすぎた予想",
        "desc": "予想屋で1人以上当たっていたが死亡者より少なく予想する。"
      },
      {
        "id": "predictor_too_many",
        "name": "多すぎた予想",
        "desc": "予想屋で実際の死亡者より多く予想する。"
      },
      {
        "id": "first_predictor",
        "name": "死を予想する者",
        "desc": "初めて予想屋になる。"
      },
      {
        "id": "win_predictor",
        "name": "完全的中",
        "desc": "予想屋で勝利する。"
      }
    ],
    "kana": "よそうや"
  },
  {
    "key": "MERCENARY",
    "id": "mercenary",
    "name": "傭兵",
    "team": "third",
    "order": 171,
    "desc": "夜にプレイヤー1人を護衛します。護衛対象が死亡しそうになった時に守れれば追加勝利します。護衛対象が死にそうにならなかった場合や、自身が死亡した場合は敗北します。",
    "achievements": [
      {
        "id": "mercenary_no_danger",
        "name": "こいつ俺が守らなくても強いじゃねぇか",
        "desc": "傭兵で自身も死なず、護衛対象も死にそうにならない。"
      },
      {
        "id": "mercenary_same_time_dead",
        "name": "俺の護衛も、ここまでか……。",
        "desc": "傭兵で護衛対象と自身が同時に死亡する。"
      },
      {
        "id": "mercenary_save_queen",
        "name": "王国の未来はここで終わらせねえよ。",
        "desc": "傭兵で女王を死から守る。"
      },
      {
        "id": "mercenary_save_death_wisher",
        "name": "そうやすやすと死のうとするんじゃねえ、命は大切にしたほうがいいぜ",
        "desc": "傭兵でてるてる系、賞金稼ぎ、殉職者を死から守る。"
      },
      {
        "id": "mercenary_save_executioner_target",
        "name": "お前、とんでもない奴に目をつけられたもんだな",
        "desc": "傭兵で処刑人のターゲットを死から守る。"
      },
      {
        "id": "mercenary_save_lover",
        "name": "お前だけは必ず俺が守る。",
        "desc": "傭兵で自身が恋人の時に相方を死から守る。"
      },
      {
        "id": "mercenary_save_follower",
        "name": "生きろ。それが俺の命令だ。",
        "desc": "傭兵で自分の従者またはフリーターを死から守る。"
      },
      {
        "id": "first_mercenary",
        "name": "護衛任務、開始だ。",
        "desc": "初めて傭兵になる。"
      },
      {
        "id": "win_mercenary",
        "name": "任務完了、これで安心して眠れる。",
        "desc": "傭兵で勝利する。"
      }
    ],
    "kana": "ようへい"
  },
  {
    "key": "FOX",
    "id": "fox",
    "name": "妖狐",
    "team": "third",
    "order": 143,
    "desc": "占い師または狂った占い師に占われると呪殺され、投票権と勝利条件を失います。呪殺されていない妖狐が生存している場合、村人陣営または人狼陣営の勝利を乗っ取ります。",
    "achievements": [
      {
        "id": "fox_cursed",
        "name": "消えた妖狐",
        "desc": "妖狐で呪殺される。"
      },
      {
        "id": "first_fox",
        "name": "狐火の目覚め",
        "desc": "初めて妖狐になる。"
      },
      {
        "id": "win_fox",
        "name": "今宵は油揚げの気分",
        "desc": "妖狐で勝利する。"
      },
      {
        "id": "fox_vote_tie_exile",
        "name": "油揚げ争奪戦",
        "desc": "妖狐投票で同数最多になり追放される。"
      }
    ],
    "kana": "ようこ"
  },
  {
    "key": "YOKAI_TANUKI",
    "id": "yokai_tanuki",
    "name": "妖狸",
    "team": "third",
    "order": 161,
    "desc": "人狼・狂信者・マーリン・魔界公爵から人狼に見え、自分は初期役職の人狼系とスパイを知ります。昇格狂人は分かりません。占い結果は妖狸で、呪殺可能な占いにより呪殺されます。最初から人狼系が存在し、人狼陣営勝利時に生存していれば単独勝利します。神の祝福では呪殺・執行されていなければ勝利できます。",
    "achievements": [
      {
        "id": "first_yokai_tanuki",
        "name": "化け狸",
        "desc": "初めて妖狸になる。"
      },
      {
        "id": "win_yokai_tanuki",
        "name": "狸寝入り",
        "desc": "妖狸で初めて勝利する。"
      },
      {
        "id": "lose_yokai_tanuki",
        "name": "尻尾を掴まれた",
        "desc": "妖狸で初めて敗北する。"
      },
      {
        "id": "yokai_tanuki_no_living_wolf",
        "name": "ぼっち山の狸",
        "desc": "人狼系も昇格狂人も生存者にいない状態で妖狸として敗北する。"
      },
      {
        "id": "yokai_tanuki_cursed",
        "name": "今日はたぬき鍋パーティーだ！",
        "desc": "妖狸で呪殺される。"
      }
    ],
    "kana": "ようり"
  },
  {
    "key": "RASETSU",
    "id": "rasetsu",
    "name": "羅刹",
    "team": "third",
    "order": 166,
    "desc": "ランダムな愛する人を得ます。愛する人が死亡した場合、その相手と追加勝利します。",
    "achievements": [],
    "kana": "らせつ"
  },
  {
    "key": "COPYIST",
    "id": "copyist",
    "name": "コピリスト",
    "team": "third",
    "order": 181,
    "desc": "事前に変化公開の役職を知り\nその中から一つ役職を選びその役職になり\n能力も使用できます。\n\nそのコピーした役職を持つ者が死亡するか、\nコピーした役職が墓地にあれば追加勝利です。\n\nしかし、コピーする役職を選択したとき\n既にコピリストから\n他の役職に変化していた場合は\nコピーに失敗します。\n\nコピリストとしての判定は役職に付随するため\n他の役職に変わった場合は勝利条件は\n本来のその役職の勝利条件です。\n※一部特定の役職はコピーできません",
    "achievements": [
      {
        "id": "copyist_second_fiddle",
        "name": "二番煎じ",
        "desc": "コピリストでコピーした役職を持つ者が生存したままゲームが終了し敗北する。"
      },
      {
        "id": "first_copyist",
        "name": "将来の夢",
        "desc": "初めてコピリストになる。"
      },
      {
        "id": "win_copyist",
        "name": "本物として生きる道",
        "desc": "コピリストで勝利する。"
      }
    ],
    "kana": "コピリスト"
  },
  {
    "key": "DETECTIVE_GHOST",
    "id": "detective_ghost",
    "name": "探偵の亡霊",
    "team": "third",
    "order": 182,
    "desc": "投票終了時に自身が死亡していた場合、\n能力が発動しプレイヤーを1人選びます。\n選んだプレイヤーの最終役職を当てると、\n追加勝利します。",
    "achievements": [
      {
        "id": "first_detective_ghost",
        "name": "死んでも事件は終わらない",
        "desc": "初めて探偵の亡霊になる。"
      },
      {
        "id": "win_detective_ghost",
        "name": "墓場に真実あり",
        "desc": "探偵の亡霊で勝利する。"
      },
      {
        "id": "detective_ghost_guess_detective",
        "name": "ベイカー街の亡霊",
        "desc": "探偵の亡霊が名探偵と解答して勝利する。"
      }
    ],
    "kana": "たんていのぼうれい"
  },
  {
    "key": "EVEN_ONE",
    "id": "even_one",
    "name": "偶数人",
    "team": "third",
    "order": 178,
    "desc": "自分への票数が偶数だと票数にかかわらず生存し、\n自分への票数が奇数だと票数にかかわらず死亡します。\n試合終了時生存者が偶数だと追加勝利です。\n生存者が0人だと敗北します。",
    "achievements": [
      {
        "id": "first_even_one",
        "name": "2人分の命",
        "desc": "初めて偶数人になる。"
      },
      {
        "id": "win_even_one",
        "name": "偶数",
        "desc": "偶数人で勝利する。"
      }
    ],
    "kana": "ぐうすうびと"
  },
  {
    "key": "JESTER_GHOST",
    "id": "jester_ghost",
    "name": "道化の怨霊",
    "team": "third",
    "order": 179,
    "desc": "夜に1人恨む対象を選びます。\n自身が追放されるとその恨んでいる対象を恨み殺します。\nしかし恨んでいる対象が恨殺以外の死因で\n先に死亡した場合は敗北します。\n追放されたうえで恨んでいる対象を恨み殺せれば追加勝利です。\n恨み殺されたプレイヤーは\n殉職者か勝ち組ではない場合無条件で敗北します。",
    "achievements": [
      {
        "id": "jester_ghost_target_died_early",
        "name": "は？何勝手に死んでんだよ",
        "desc": "道化の怨霊で恨んだ相手が恨殺以外の死因で先に死亡する。"
      },
      {
        "id": "first_jester_ghost",
        "name": "うらめしや〜",
        "desc": "初めて道化の怨霊になる。"
      },
      {
        "id": "win_jester_ghost",
        "name": "恨み晴らさでおくべきか",
        "desc": "道化の怨霊で勝利する。"
      }
    ],
    "kana": "どうけのおんりょう"
  },
  {
    "key": "MULTI_PERSONALITY",
    "id": "multi_personality",
    "name": "多重人格",
    "team": "third",
    "order": 176,
    "desc": "多重人格\n他のプレイヤーが夜能力、昼能力を使うたびに\n村人と狂人の人格が入れ替わります。\n最初の人格がどちらかはランダムです。\n投票開始時点での人格の陣営が勝利条件です。\n多重人格から別の役職になったとき\n1回のみ何に変化したか知ることができます。",
    "achievements": [
      {
        "id": "multi_personality_first",
        "name": "白黒",
        "desc": "初めて多重人格になる。"
      },
      {
        "id": "multi_personality_win_village",
        "name": "白",
        "desc": "多重人格で村人陣営として勝利する。"
      },
      {
        "id": "multi_personality_win_wolf",
        "name": "黒",
        "desc": "多重人格で人狼陣営として勝利する。"
      },
      {
        "id": "multi_personality_loss",
        "name": "グレー",
        "desc": "多重人格で敗北する。"
      },
      {
        "id": "multi_personality_flip3",
        "name": "白黒白黒白黒",
        "desc": "多重人格として3回以上人格が入れ替わる。"
      }
    ],
    "kana": "たじゅうじんかく"
  },
  {
    "key": "ODD_ONE",
    "id": "odd_one",
    "name": "奇数人",
    "team": "third",
    "order": 177,
    "desc": "自分への票が奇数だと票数にかかわらず生存し、\n自分への票が偶数だと票数にかかわらず死亡します。\n試合終了時死亡者が奇数だと追加勝利です。\n死亡者が0人だと敗北します。",
    "achievements": [
      {
        "id": "first_odd_one",
        "name": "ただの数字",
        "desc": "初めて奇数人になる。"
      },
      {
        "id": "win_odd_one",
        "name": "奇数",
        "desc": "奇数人で勝利する。"
      }
    ],
    "kana": "きすうびと"
  },
  {
    "key": "TELEPATHIST",
    "id": "telepathist",
    "name": "テレパシスト",
    "team": "third",
    "order": 180,
    "desc": "夜に接続するプレイヤーを1人選びます。\n接続した対象と昼時間中テレパシーで会話することができます。\n接続した相手が死亡すると後追いします。\n接続した相手が生存したうえで勝利すれば追加勝利です。\nただし、接続した相手が死亡しないと勝てない役職だったうえで\n接続先が死亡して勝利した場合は追加勝利できます。",
    "achievements": [
      {
        "id": "telepathist_follow_death",
        "name": "一心同体",
        "desc": "テレパシストで接続先が死亡し後追いする。"
      },
      {
        "id": "first_telepathist",
        "name": "一念通天",
        "desc": "初めてテレパシストになる。"
      },
      {
        "id": "win_telepathist",
        "name": "以心伝心",
        "desc": "テレパシストで勝利する。"
      }
    ],
    "kana": "テレパシスト"
  },
  {
    "key": "WRAITH",
    "id": "wraith",
    "name": "死霊",
    "team": "third",
    "order": 132,
    "desc": "ネクロマンサーの能力によって、敗北していた死亡者から変化する役職です。変化した時点で勝者に加わります。",
    "achievements": [],
    "kana": "しりょう"
  },
  {
    "key": "DOPPELGANGER",
    "id": "doppelganger",
    "name": "ドッペルゲンガー",
    "team": "third",
    "order": 133,
    "desc": "第三陣営。夜の最初に1人を選び、その人の初期役職をコピーします。ドッペルゲンガーをコピーした場合は村人になります。",
    "achievements": [
      {
        "id": "doppel_copy_village",
        "name": "村を写す影",
        "desc": "ドッペルゲンガーで村人陣営をコピーする。"
      },
      {
        "id": "doppel_copy_wolf",
        "name": "狼を写す影",
        "desc": "ドッペルゲンガーで人狼陣営をコピーする。"
      },
      {
        "id": "doppel_copy_third",
        "name": "第三を写す影",
        "desc": "ドッペルゲンガーで第三陣営をコピーする。"
      },
      {
        "id": "doppel_copy_doppel_to_villager",
        "name": "写せない影",
        "desc": "ドッペルゲンガーをコピーしようとして村人になる。"
      },
      {
        "id": "first_doppelganger",
        "name": "誰かになる者",
        "desc": "初めてドッペルゲンガーになる。"
      }
    ],
    "kana": "ドッペルゲンガー"
  }
];
