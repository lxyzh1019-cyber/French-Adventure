// Vocabulary and sentence content, keyed by grade band.
// Every vocabulary entry is {fr, en, zh} — Chinese is part of the content
// contract, not optional.
import { frTokenize } from '../util/fr-text.js';

export const CURRICULUM = {
  4: {
    colours:{name:"Colours",icon:"🎨",vocab:[
      {fr:"rouge",en:"red",zh:"红色"},{fr:"bleu",en:"blue",zh:"蓝色"},{fr:"vert",en:"green",zh:"绿色"},
      {fr:"jaune",en:"yellow",zh:"黄色"},{fr:"orange",en:"orange",zh:"橙色"},{fr:"violet",en:"purple",zh:"紫色"},
      {fr:"blanc",en:"white",zh:"白色"},{fr:"noir",en:"black",zh:"黑色"},{fr:"rose",en:"pink",zh:"粉红色"},{fr:"brun",en:"brown",zh:"棕色"}]},
    numbers:{name:"Numbers",icon:"🔢",vocab:[
      {fr:"un",en:"one",zh:"一"},{fr:"deux",en:"two",zh:"二"},{fr:"trois",en:"three",zh:"三"},
      {fr:"quatre",en:"four",zh:"四"},{fr:"cinq",en:"five",zh:"五"},{fr:"six",en:"six",zh:"六"},
      {fr:"sept",en:"seven",zh:"七"},{fr:"huit",en:"eight",zh:"八"},{fr:"neuf",en:"nine",zh:"九"},
      {fr:"dix",en:"ten",zh:"十"},{fr:"vingt",en:"twenty",zh:"二十"},{fr:"cent",en:"hundred",zh:"百"}]},
    family:{name:"Family",icon:"👨‍👩‍👧",vocab:[
      {fr:"mère",en:"mother",zh:"妈妈"},{fr:"père",en:"father",zh:"爸爸"},{fr:"sœur",en:"sister",zh:"姐妹"},
      {fr:"frère",en:"brother",zh:"兄弟"},{fr:"grand-mère",en:"grandmother",zh:"奶奶"},{fr:"grand-père",en:"grandfather",zh:"爷爷"},
      {fr:"tante",en:"aunt",zh:"阿姨"},{fr:"oncle",en:"uncle",zh:"叔叔"},{fr:"bébé",en:"baby",zh:"婴儿"}]},
    classroom:{name:"Classroom",icon:"📚",vocab:[
      {fr:"crayon",en:"pencil",zh:"铅笔"},{fr:"livre",en:"book",zh:"书"},{fr:"cahier",en:"notebook",zh:"笔记本"},
      {fr:"chaise",en:"chair",zh:"椅子"},{fr:"table",en:"table",zh:"桌子"},{fr:"règle",en:"ruler",zh:"尺子"},
      {fr:"gomme",en:"eraser",zh:"橡皮"},{fr:"stylo",en:"pen",zh:"钢笔"},{fr:"sac",en:"bag",zh:"书包"}]},
    animals:{name:"Animals",icon:"🐾",vocab:[
      {fr:"chien",en:"dog",zh:"狗"},{fr:"chat",en:"cat",zh:"猫"},{fr:"oiseau",en:"bird",zh:"鸟"},
      {fr:"poisson",en:"fish",zh:"鱼"},{fr:"lapin",en:"rabbit",zh:"兔子"},{fr:"cheval",en:"horse",zh:"马"},
      {fr:"vache",en:"cow",zh:"牛"},{fr:"cochon",en:"pig",zh:"猪"},{fr:"canard",en:"duck",zh:"鸭子"},{fr:"ours",en:"bear",zh:"熊"}]},
    food:{name:"Food",icon:"🍎",vocab:[
      {fr:"pomme",en:"apple",zh:"苹果"},{fr:"pain",en:"bread",zh:"面包"},{fr:"lait",en:"milk",zh:"牛奶"},
      {fr:"eau",en:"water",zh:"水"},{fr:"fromage",en:"cheese",zh:"奶酪"},{fr:"banane",en:"banana",zh:"香蕉"},
      {fr:"carotte",en:"carrot",zh:"胡萝卜"},{fr:"biscuit",en:"cookie",zh:"饼干"},{fr:"jus",en:"juice",zh:"果汁"}]}
  },
  5: {
    body:{name:"Body Parts",icon:"🫀",vocab:[
      {fr:"tête",en:"head",zh:"头"},{fr:"bras",en:"arm",zh:"手臂"},{fr:"jambe",en:"leg",zh:"腿"},
      {fr:"main",en:"hand",zh:"手"},{fr:"pied",en:"foot",zh:"脚"},{fr:"nez",en:"nose",zh:"鼻子"},
      {fr:"bouche",en:"mouth",zh:"嘴巴"},{fr:"œil",en:"eye",zh:"眼睛"},{fr:"oreille",en:"ear",zh:"耳朵"}]},
    weather:{name:"Weather",icon:"🌤",vocab:[
      {fr:"soleil",en:"sun",zh:"太阳"},{fr:"pluie",en:"rain",zh:"雨"},{fr:"neige",en:"snow",zh:"雪"},
      {fr:"vent",en:"wind",zh:"风"},{fr:"nuage",en:"cloud",zh:"云"},{fr:"froid",en:"cold",zh:"冷"},
      {fr:"chaud",en:"hot",zh:"热"},{fr:"orage",en:"storm",zh:"暴风雨"},{fr:"arc-en-ciel",en:"rainbow",zh:"彩虹"}]},
    seasons:{name:"Seasons",icon:"🍂",vocab:[
      {fr:"printemps",en:"spring",zh:"春天"},{fr:"été",en:"summer",zh:"夏天"},
      {fr:"automne",en:"autumn",zh:"秋天"},{fr:"hiver",en:"winter",zh:"冬天"},
      {fr:"janvier",en:"January",zh:"一月"},{fr:"juillet",en:"July",zh:"七月"},{fr:"décembre",en:"December",zh:"十二月"}]},
    community:{name:"Community",icon:"🏘",vocab:[
      {fr:"école",en:"school",zh:"学校"},{fr:"hôpital",en:"hospital",zh:"医院"},{fr:"parc",en:"park",zh:"公园"},
      {fr:"magasin",en:"store",zh:"商店"},{fr:"bibliothèque",en:"library",zh:"图书馆"},{fr:"maison",en:"house",zh:"房子"},
      {fr:"rue",en:"street",zh:"街道"},{fr:"bus",en:"bus",zh:"公共汽车"}]},
    time:{name:"Time",icon:"⏰",vocab:[
      {fr:"aujourd'hui",en:"today",zh:"今天"},{fr:"demain",en:"tomorrow",zh:"明天"},{fr:"hier",en:"yesterday",zh:"昨天"},
      {fr:"matin",en:"morning",zh:"早晨"},{fr:"soir",en:"evening",zh:"晚上"},{fr:"semaine",en:"week",zh:"星期"},
      {fr:"mois",en:"month",zh:"月"},{fr:"année",en:"year",zh:"年"}]}
  },
  6: {
    verbs:{name:"Past Tense",icon:"⏮",vocab:[
      {fr:"j'ai mangé",en:"I ate",zh:"我吃了"},{fr:"j'ai parlé",en:"I spoke",zh:"我说了"},
      {fr:"j'ai fini",en:"I finished",zh:"我完成了"},{fr:"j'ai vu",en:"I saw",zh:"我看见了"},
      {fr:"j'ai fait",en:"I did/made",zh:"我做了"},{fr:"j'ai eu",en:"I had",zh:"我有了"},
      {fr:"j'ai été",en:"I was",zh:"我曾是"},{fr:"j'ai pris",en:"I took",zh:"我拿了"}]},
    adjectives:{name:"Adjectives",icon:"✨",vocab:[
      {fr:"grand",en:"big/tall",zh:"大/高"},{fr:"petit",en:"small",zh:"小"},{fr:"beau",en:"beautiful",zh:"漂亮"},
      {fr:"nouveau",en:"new",zh:"新"},{fr:"vieux",en:"old",zh:"旧/老"},{fr:"bon",en:"good",zh:"好"},
      {fr:"mauvais",en:"bad",zh:"坏"},{fr:"heureux",en:"happy",zh:"快乐"},{fr:"triste",en:"sad",zh:"悲伤"}]},
    places:{name:"Places",icon:"🗺",vocab:[
      {fr:"ville",en:"city",zh:"城市"},{fr:"campagne",en:"countryside",zh:"乡村"},{fr:"plage",en:"beach",zh:"海滩"},
      {fr:"montagne",en:"mountain",zh:"山"},{fr:"forêt",en:"forest",zh:"森林"},{fr:"rivière",en:"river",zh:"河流"},
      {fr:"lac",en:"lake",zh:"湖"},{fr:"île",en:"island",zh:"岛屿"}]},
    school:{name:"School",icon:"🏫",vocab:[
      {fr:"la salle de classe",en:"the classroom",zh:"教室"},{fr:"le professeur",en:"the teacher",zh:"老师"},{fr:"l'élève",en:"the student",zh:"学生"},
      {fr:"le cours",en:"the lesson",zh:"课"},{fr:"les devoirs",en:"homework",zh:"作业"},{fr:"l'examen",en:"the exam",zh:"考试"},
      {fr:"la note",en:"the grade",zh:"分数"},{fr:"réussir",en:"to pass/succeed",zh:"通过"},{fr:"échouer",en:"to fail",zh:"不及格"},
      {fr:"étudier",en:"to study",zh:"学习"}]},
    hobbies:{name:"Hobbies",icon:"🎨",vocab:[
      {fr:"dessiner",en:"to draw",zh:"画画"},{fr:"chanter",en:"to sing",zh:"唱歌"},{fr:"danser",en:"to dance",zh:"跳舞"},
      {fr:"jouer",en:"to play",zh:"玩"},{fr:"lire",en:"to read",zh:"阅读"},{fr:"écrire",en:"to write",zh:"写作"},
      {fr:"nager",en:"to swim",zh:"游泳"},{fr:"courir",en:"to run",zh:"跑步"},{fr:"le sport",en:"sport",zh:"运动"},
      {fr:"la musique",en:"music",zh:"音乐"},{fr:"le film",en:"movie",zh:"电影"}]},
    health:{name:"Health",icon:"🩺",vocab:[
      {fr:"le médecin",en:"the doctor",zh:"医生"},{fr:"l'infirmier",en:"the nurse",zh:"护士"},{fr:"le médicament",en:"medicine",zh:"药"},
      {fr:"malade",en:"sick",zh:"生病"},{fr:"le mal de tête",en:"headache",zh:"头痛"},{fr:"la fièvre",en:"fever",zh:"发烧"},
      {fr:"le rhume",en:"cold (illness)",zh:"感冒"},{fr:"se reposer",en:"to rest",zh:"休息"},{fr:"mieux",en:"better",zh:"好些"},
      {fr:"la santé",en:"health",zh:"健康"}]}
  },
  7: {
    questions:{name:"Questions",icon:"❓",vocab:[
      {fr:"qui",en:"who",zh:"谁"},{fr:"quoi",en:"what",zh:"什么"},{fr:"où",en:"where",zh:"哪里"},
      {fr:"quand",en:"when",zh:"什么时候"},{fr:"pourquoi",en:"why",zh:"为什么"},{fr:"comment",en:"how",zh:"怎么"},
      {fr:"combien",en:"how many",zh:"多少"},{fr:"quel",en:"which",zh:"哪个"}]},
    negation:{name:"Negation",icon:"🚫",vocab:[
      {fr:"ne...pas",en:"not",zh:"不"},{fr:"ne...jamais",en:"never",zh:"从不"},{fr:"ne...rien",en:"nothing",zh:"什么都没有"},
      {fr:"ne...plus",en:"no more",zh:"不再"},{fr:"ne...personne",en:"nobody",zh:"没有人"},
      {fr:"ne...que",en:"only",zh:"只有"}]},
    expressions:{name:"Expressions",icon:"💬",vocab:[
      {fr:"bien sûr",en:"of course",zh:"当然"},{fr:"peut-être",en:"maybe",zh:"也许"},{fr:"d'accord",en:"okay/agreed",zh:"好的"},
      {fr:"pas du tout",en:"not at all",zh:"一点也不"},{fr:"tout à fait",en:"absolutely",zh:"完全正确"},
      {fr:"c'est-à-dire",en:"that is to say",zh:"也就是说"}]},
    food_meals:{name:"Food & meals",icon:"🍽",vocab:[
      {fr:"le petit-déjeuner",en:"breakfast",zh:"早餐"},{fr:"le déjeuner",en:"lunch",zh:"午餐"},{fr:"le dîner",en:"dinner",zh:"晚餐"},
      {fr:"le goûter",en:"afternoon snack",zh:"点心"},{fr:"avoir faim",en:"to be hungry",zh:"饿"},{fr:"avoir soif",en:"to be thirsty",zh:"渴"},
      {fr:"le restaurant",en:"restaurant",zh:"餐厅"},{fr:"la recette",en:"recipe",zh:"食谱"},{fr:"cuisiner",en:"to cook",zh:"做饭"},
      {fr:"délicieux",en:"delicious",zh:"美味"}]},
    home:{name:"Home",icon:"🏠",vocab:[
      {fr:"la chambre",en:"bedroom",zh:"卧室"},{fr:"la cuisine",en:"kitchen",zh:"厨房"},{fr:"le salon",en:"living room",zh:"客厅"},
      {fr:"la salle de bain",en:"bathroom",zh:"浴室"},{fr:"le jardin",en:"garden",zh:"花园"},{fr:"le garage",en:"garage",zh:"车库"},
      {fr:"la porte",en:"door",zh:"门"},{fr:"la fenêtre",en:"window",zh:"窗户"},{fr:"le lit",en:"bed",zh:"床"},
      {fr:"nettoyer",en:"to clean",zh:"打扫"}]},
    travel:{name:"Travel",icon:"✈️",vocab:[
      {fr:"le voyage",en:"trip",zh:"旅行"},{fr:"le billet",en:"ticket",zh:"票"},{fr:"l'aéroport",en:"airport",zh:"机场"},
      {fr:"le train",en:"train",zh:"火车"},{fr:"l'autobus",en:"bus",zh:"公共汽车"},{fr:"le taxi",en:"taxi",zh:"出租车"},
      {fr:"la gare",en:"train station",zh:"火车站"},{fr:"l'hôtel",en:"hotel",zh:"酒店"},{fr:"la valise",en:"suitcase",zh:"行李箱"},
      {fr:"partir",en:"to leave",zh:"出发"}]}
  },
  8: {
    irregular:{name:"Irregular Verbs",icon:"⚡",vocab:[
      {fr:"être",en:"to be",zh:"是"},{fr:"avoir",en:"to have",zh:"有"},{fr:"aller",en:"to go",zh:"去"},
      {fr:"faire",en:"to do/make",zh:"做"},{fr:"venir",en:"to come",zh:"来"},{fr:"prendre",en:"to take",zh:"拿"},
      {fr:"pouvoir",en:"to be able",zh:"能够"},{fr:"vouloir",en:"to want",zh:"想要"},{fr:"savoir",en:"to know",zh:"知道"}]},
    formal:{name:"Formal vs Informal",icon:"🎩",vocab:[
      {fr:"tu",en:"you (informal)",zh:"你（非正式）"},{fr:"vous",en:"you (formal/plural)",zh:"您/你们（正式）"},
      {fr:"bonjour",en:"hello (formal)",zh:"您好（正式）"},{fr:"salut",en:"hi (informal)",zh:"嗨（非正式）"},
      {fr:"au revoir",en:"goodbye (formal)",zh:"再见（正式）"},{fr:"ciao",en:"bye (informal)",zh:"拜（非正式）"}]},
    dialogue:{name:"Dialogues",icon:"🗣",vocab:[
      {fr:"enchanté",en:"pleased to meet you",zh:"很高兴认识你"},{fr:"je vous en prie",en:"you're welcome (formal)",zh:"不客气（正式）"},
      {fr:"je t'en prie",en:"you're welcome (informal)",zh:"不客气（非正式）"},{fr:"excusez-moi",en:"excuse me",zh:"打扰一下"},
      {fr:"je suis désolé",en:"I am sorry",zh:"我很抱歉"},{fr:"avec plaisir",en:"with pleasure",zh:"很乐意"}]}
  },
  9: {
    opinion:{name:"Opinions",icon:"💭",vocab:[
      {fr:"je pense que",en:"I think that",zh:"我认为"},{fr:"à mon avis",en:"in my opinion",zh:"在我看来"},
      {fr:"je crois que",en:"I believe that",zh:"我相信"},{fr:"selon moi",en:"according to me",zh:"据我看"},
      {fr:"il me semble que",en:"it seems to me that",zh:"在我看来"},{fr:"je suis convaincu que",en:"I am convinced that",zh:"我确信"}]},
    complex:{name:"Complex Sentences",icon:"📝",vocab:[
      {fr:"bien que",en:"although",zh:"尽管"},{fr:"parce que",en:"because",zh:"因为"},{fr:"donc",en:"therefore",zh:"因此"},
      {fr:"cependant",en:"however",zh:"然而"},{fr:"néanmoins",en:"nevertheless",zh:"尽管如此"},
      {fr:"en effet",en:"indeed",zh:"确实"},{fr:"par conséquent",en:"consequently",zh:"因此"}]},
    reading:{name:"Reading",icon:"📖",vocab:[
      {fr:"le personnage",en:"the character",zh:"人物"},{fr:"l'intrigue",en:"the plot",zh:"情节"},
      {fr:"le thème",en:"the theme",zh:"主题"},{fr:"le chapitre",en:"the chapter",zh:"章节"},
      {fr:"l'auteur",en:"the author",zh:"作者"},{fr:"le narrateur",en:"the narrator",zh:"叙述者"}]}
  },
  10: {
    g10_identite:{name:"Identité & valeurs",icon:"🪪",vocab:[
      {fr:"identité",en:"identity",zh:"身份"},{fr:"personnalité",en:"personality",zh:"个性"},{fr:"caractère",en:"character",zh:"性格"},
      {fr:"valeurs",en:"values",zh:"价值观"},{fr:"croyances",en:"beliefs",zh:"信念"},{fr:"rêves",en:"dreams",zh:"梦想"},
      {fr:"ambition",en:"ambition",zh:"志向"},{fr:"succès",en:"success",zh:"成功"},{fr:"échec",en:"failure",zh:"失败"},
      {fr:"force",en:"strength",zh:"长处"},{fr:"faiblesse",en:"weakness",zh:"弱点"},{fr:"compétence",en:"skill",zh:"能力"},
      {fr:"talent",en:"talent",zh:"天赋"},{fr:"passion",en:"passion",zh:"热爱"},{fr:"intérêt",en:"interest",zh:"兴趣"},
      {fr:"choix",en:"choice",zh:"选择"},{fr:"décision",en:"decision",zh:"决定"},{fr:"indépendance",en:"independence",zh:"独立"},
      {fr:"liberté",en:"freedom",zh:"自由"},{fr:"responsabilité",en:"responsibility",zh:"责任"},{fr:"carrière",en:"career",zh:"职业"},
      {fr:"métier",en:"job/trade",zh:"职业"},{fr:"profession",en:"profession",zh:"专业"},{fr:"emploi",en:"employment",zh:"工作"},
      {fr:"travail",en:"work",zh:"劳动"},{fr:"stage",en:"internship",zh:"实习"},{fr:"entrevue",en:"interview",zh:"面试"},
      {fr:"curriculum vitae",en:"résumé/CV",zh:"简历"},{fr:"employeur",en:"employer",zh:"雇主"},{fr:"collègue",en:"colleague",zh:"同事"}]},
    g10_etudes:{name:"Études & objectifs",icon:"🎓",vocab:[
      {fr:"université",en:"university",zh:"大学"},{fr:"collège",en:"college/high school",zh:"学院/中学"},{fr:"études",en:"studies",zh:"学业"},
      {fr:"diplôme",en:"diploma",zh:"文凭"},{fr:"formation",en:"training",zh:"培训"},
      {fr:"apprentissage",en:"learning",zh:"学习"},{fr:"avenir",en:"future",zh:"未来"},{fr:"futur",en:"future",zh:"将来"},
      {fr:"but",en:"goal",zh:"目标"},{fr:"objectif",en:"objective",zh:"目标"},{fr:"gagner sa vie",en:"to earn a living",zh:"谋生"},
      {fr:"salaire",en:"salary",zh:"工资"},{fr:"argent",en:"money",zh:"钱"},{fr:"bénévolat",en:"volunteering",zh:"志愿活动"},
      {fr:"expérience",en:"experience",zh:"经验"},{fr:"domaine",en:"field",zh:"领域"},{fr:"secteur",en:"sector",zh:"行业"},
      {fr:"médecine",en:"medicine",zh:"医学"},{fr:"droit",en:"law",zh:"法律"},{fr:"ingénierie",en:"engineering",zh:"工程"},
      {fr:"arts",en:"arts",zh:"艺术"},{fr:"technologie",en:"technology",zh:"技术"},{fr:"sciences",en:"sciences",zh:"科学"},
      {fr:"commerce",en:"business",zh:"商科"},{fr:"éducation",en:"education",zh:"教育"},{fr:"santé",en:"health",zh:"健康"},
      {fr:"environnement",en:"environment",zh:"环境"},{fr:"politique",en:"politics",zh:"政治"},{fr:"société",en:"society",zh:"社会"},
      {fr:"communauté",en:"community",zh:"社区"}]},
    g10_mondial:{name:"Monde & société",icon:"🌍",vocab:[
      {fr:"citoyen",en:"citizen",zh:"公民"},{fr:"droits",en:"rights",zh:"权利"},{fr:"devoirs",en:"duties",zh:"义务"},
      {fr:"justice",en:"justice",zh:"公正"},{fr:"égalité",en:"equality",zh:"平等"},{fr:"diversité",en:"diversity",zh:"多样性"},
      {fr:"culture",en:"culture",zh:"文化"},{fr:"tradition",en:"tradition",zh:"传统"},{fr:"langue",en:"language",zh:"语言"},
      {fr:"bilinguisme",en:"bilingualism",zh:"双语"},{fr:"mondialisation",en:"globalization",zh:"全球化"},{fr:"voyage",en:"travel",zh:"旅行"},
      {fr:"immigration",en:"immigration",zh:"移民"},{fr:"intégration",en:"integration",zh:"融入"},{fr:"respect",en:"respect",zh:"尊重"},
      {fr:"tolérance",en:"tolerance",zh:"宽容"},{fr:"solidarité",en:"solidarity",zh:"团结"},{fr:"paix",en:"peace",zh:"和平"},
      {fr:"conflit",en:"conflict",zh:"冲突"},{fr:"problème",en:"problem",zh:"问题"},{fr:"solution",en:"solution",zh:"解决方案"},
      {fr:"défi",en:"challenge",zh:"挑战"},{fr:"opportunité",en:"opportunity",zh:"机会"},{fr:"changement",en:"change",zh:"变化"},
      {fr:"évolution",en:"evolution",zh:"演变"},{fr:"progrès",en:"progress",zh:"进步"},{fr:"innovation",en:"innovation",zh:"创新"},
      {fr:"médias",en:"media",zh:"媒体"},{fr:"influence",en:"influence",zh:"影响"},{fr:"opinion",en:"opinion",zh:"观点"}]},
    g10_verbes:{name:"Compétences & verbes",icon:"🎯",vocab:[
      {fr:"penser",en:"to think",zh:"思考"},{fr:"croire",en:"to believe",zh:"相信"},{fr:"savoir",en:"to know",zh:"知道"},
      {fr:"connaître",en:"to know (familiar)",zh:"了解"},{fr:"comprendre",en:"to understand",zh:"理解"},{fr:"analyser",en:"to analyze",zh:"分析"},
      {fr:"évaluer",en:"to evaluate",zh:"评估"},{fr:"exprimer",en:"to express",zh:"表达"},{fr:"discuter",en:"to discuss",zh:"讨论"},
      {fr:"débattre",en:"to debate",zh:"辩论"},{fr:"s'intéresser",en:"to take an interest",zh:"感兴趣"},{fr:"se spécialiser",en:"to specialize",zh:"专攻"},
      {fr:"postuler",en:"to apply (for a job)",zh:"申请"},{fr:"travailler",en:"to work",zh:"工作"},{fr:"réussir",en:"to succeed",zh:"成功"},
      {fr:"échouer",en:"to fail",zh:"失败"},{fr:"persévérer",en:"to persevere",zh:"坚持"},{fr:"encourager",en:"to encourage",zh:"鼓励"},
      {fr:"soutenir",en:"to support",zh:"支持"},{fr:"aider",en:"to help",zh:"帮助"},{fr:"si",en:"if",zh:"如果"},
      {fr:"quand",en:"when",zh:"当…时"},{fr:"lorsque",en:"when",zh:"当"},{fr:"puisque",en:"since/because",zh:"既然"},
      {fr:"parce que",en:"because",zh:"因为"},{fr:"pourtant",en:"yet/however",zh:"然而"},{fr:"cependant",en:"however",zh:"可是"},
      {fr:"néanmoins",en:"nevertheless",zh:"尽管如此"},{fr:"donc",en:"so/therefore",zh:"所以"},{fr:"ainsi",en:"thus",zh:"因此"}]},
    g10_qualificatifs:{name:"Qualificatifs & fréquence",icon:"✨",vocab:[
      {fr:"possible",en:"possible",zh:"可能的"},{fr:"impossible",en:"impossible",zh:"不可能"},{fr:"probable",en:"probable",zh:"很可能"},
      {fr:"certain",en:"certain",zh:"确定"},{fr:"incertain",en:"uncertain",zh:"不确定"},{fr:"important",en:"important",zh:"重要"},
      {fr:"essentiel",en:"essential",zh:"必要"},{fr:"nécessaire",en:"necessary",zh:"必需"},{fr:"utile",en:"useful",zh:"有用"},
      {fr:"efficace",en:"efficient",zh:"高效"},{fr:"créatif",en:"creative",zh:"有创意"},{fr:"dynamique",en:"dynamic",zh:"有活力"},
      {fr:"autonome",en:"autonomous",zh:"自主"},{fr:"organisé",en:"organized",zh:"有条理"},{fr:"motivé",en:"motivated",zh:"积极"},
      {fr:"sérieux",en:"serious",zh:"认真"},{fr:"curieux",en:"curious",zh:"好奇"},{fr:"ouvert",en:"open-minded",zh:"开放"},
      {fr:"sociable",en:"sociable",zh:"善交际"},{fr:"honnête",en:"honest",zh:"诚实"},{fr:"souvent",en:"often",zh:"经常"},
      {fr:"rarement",en:"rarely",zh:"很少"},{fr:"toujours",en:"always",zh:"总是"},{fr:"jamais",en:"never",zh:"从不"},
      {fr:"parfois",en:"sometimes",zh:"有时"},{fr:"déjà",en:"already",zh:"已经"},{fr:"encore",en:"still/again",zh:"还/再"},
      {fr:"maintenant",en:"now",zh:"现在"},{fr:"bientôt",en:"soon",zh:"很快"},{fr:"finalement",en:"finally",zh:"最终"}]},
    g10_lieu_modal:{name:"Lieux & verbes modaux",icon:"🔗",vocab:[
      {fr:"partout",en:"everywhere",zh:"到处"},{fr:"ailleurs",en:"elsewhere",zh:"别处"},{fr:"ici",en:"here",zh:"这里"},
      {fr:"là-bas",en:"over there",zh:"那里"},{fr:"ensemble",en:"together",zh:"一起"},{fr:"seul",en:"alone",zh:"独自"},
      {fr:"propre",en:"own/clean",zh:"自己的"},{fr:"autre",en:"other",zh:"其他"},{fr:"même",en:"same",zh:"同样"},
      {fr:"plusieurs",en:"several",zh:"几个"},{fr:"souhaiter",en:"to wish",zh:"希望"},{fr:"espérer",en:"to hope",zh:"盼望"},
      {fr:"vouloir",en:"to want",zh:"想要"},{fr:"pouvoir",en:"to be able",zh:"能够"},{fr:"devoir",en:"must/to owe",zh:"必须"},
      {fr:"falloir",en:"to be necessary",zh:"需要"},{fr:"sembler",en:"to seem",zh:"似乎"},{fr:"paraître",en:"to appear",zh:"显得"},
      {fr:"devenir",en:"to become",zh:"成为"},{fr:"rester",en:"to stay",zh:"保持"}]}
  }
};

export const G10_BATCH_C_SENTENCES = [
  { fr: "Je veux devenir ingénieur dans le futur.", en: "I want to become an engineer in the future.", zh: "我想将来成为工程师。" },
  { fr: "Si j'étudie fort, je réussirai mes examens.", en: "If I study hard, I will pass my exams.", zh: "如果我努力学习，我会通过考试。" },
  { fr: "L'identité est influencée par notre culture et nos amis.", en: "Identity is influenced by our culture and our friends.", zh: "身份受文化和朋友影响。" },
  { fr: "Quelles sont tes plus grandes forces professionnelles?", en: "What are your greatest professional strengths?", zh: "你最大的职业优势是什么？" },
  { fr: "Je cherche un stage dans le domaine de la technologie.", en: "I am looking for an internship in technology.", zh: "我在找科技领域的实习。" },
  { fr: "Il est important de respecter la diversité dans notre société.", en: "It is important to respect diversity in our society.", zh: "在社会中尊重多样性很重要。" },
  { fr: "Si j'avais plus de temps, je ferais du bénévolat.", en: "If I had more time, I would volunteer.", zh: "如果我有更多时间，我会做志愿工作。" },
  { fr: "Le bilinguisme est un grand atout en Alberta.", en: "Bilingualism is a great asset in Alberta.", zh: "在阿尔伯塔双语是很大的优势。" },
  { fr: "Je m'intéresse beaucoup aux sciences environnementales.", en: "I am very interested in environmental sciences.", zh: "我对环境科学很感兴趣。" },
  { fr: "Après l'école secondaire, je vais aller à l'université.", en: "After high school, I will go to university.", zh: "中学毕业后我要上大学。" },
  { fr: "Mon but est d'être indépendant et heureux.", en: "My goal is to be independent and happy.", zh: "我的目标是独立又快乐。" },
  { fr: "C'est un défi difficile, mais je vais persévérer.", en: "It is a difficult challenge, but I will persevere.", zh: "这是很难的挑战，但我会坚持。" },
  { fr: "Nous devons discuter des solutions pour le climat.", en: "We must discuss solutions for the climate.", zh: "我们必须讨论气候问题的解决方案。" },
  { fr: "Je pense que la technologie change notre façon de vivre.", en: "I think technology changes our way of living.", zh: "我认为技术改变了我们的生活方式。" },
  { fr: "Quelle carrière t'intéresse le plus?", en: "Which career interests you most?", zh: "你对哪种职业最感兴趣？" },
  { fr: "Il faut avoir confiance en soi pour réussir.", en: "You must have self-confidence to succeed.", zh: "要成功就必须自信。" },
  { fr: "Je voudrais voyager autour du monde avant de travailler.", en: "I would like to travel the world before working.", zh: "我想在工作前环游世界。" },
  { fr: "L'égalité des droits est essentielle pour la paix.", en: "Equal rights are essential for peace.", zh: "权利平等对和平至关重要。" },
  { fr: "Elle est une personne très organisée et motivée.", en: "She is a very organized and motivated person.", zh: "她是一个非常有条理、积极的人。" },
  { fr: "Si tu pouvais changer une chose, que changerais-tu?", en: "If you could change one thing, what would you change?", zh: "如果你能改变一件事，你会改什么？" },
  { fr: "Le marché du travail est très compétitif aujourd'hui.", en: "The job market is very competitive today.", zh: "今天的就业市场竞争激烈。" },
  { fr: "Je prépare mon CV pour une entrevue demain.", en: "I am preparing my CV for an interview tomorrow.", zh: "我在为明天的面试准备简历。" },
  { fr: "L'éducation est la clé du succès à long terme.", en: "Education is the key to long-term success.", zh: "教育是长期成功的关键。" },
  { fr: "Chaque citoyen a des responsabilités envers sa communauté.", en: "Every citizen has responsibilities toward their community.", zh: "每个公民对社区都有责任。" },
  { fr: "Je ne sais pas encore quel métier choisir.", en: "I don't yet know which job to choose.", zh: "我还不知道选什么职业。" },
  { fr: "Le bilinguisme m'offre beaucoup d'opportunités.", en: "Bilingualism offers me many opportunities.", zh: "双语给我很多机会。" },
  { fr: "Nous vivons dans un monde de plus en plus connecté.", en: "We live in an increasingly connected world.", zh: "我们生活在日益互联的世界。" },
  { fr: "Il est nécessaire d'apprendre de ses échecs.", en: "It is necessary to learn from one's failures.", zh: "必须从失败中学习。" },
  { fr: "Je souhaite trouver un emploi qui me passionne.", en: "I hope to find a job that I am passionate about.", zh: "我希望找到让我热爱的工作。" },
  { fr: "La tolérance est la base d'une société saine.", en: "Tolerance is the foundation of a healthy society.", zh: "宽容是健康社会的基础。" },
  { fr: "Quelles compétences as-tu développées cette année?", en: "What skills have you developed this year?", zh: "你今年培养了哪些能力？" },
  { fr: "Je crois que tout le monde peut faire une différence.", en: "I believe everyone can make a difference.", zh: "我相信每个人都能带来改变。" },
  { fr: "Si je gagnais à la loterie, j'aiderais les pauvres.", en: "If I won the lottery, I would help the poor.", zh: "如果我中彩票，我会帮助穷人。" },
  { fr: "L'avenir appartient à ceux qui travaillent fort.", en: "The future belongs to those who work hard.", zh: "未来属于努力的人。" },
  { fr: "C'est une expérience que je n'oublierai jamais.", en: "It is an experience I will never forget.", zh: "这是我永远不会忘记的经历。" },
  { fr: "Je me spécialise en mathématiques et en physique.", en: "I specialize in mathematics and physics.", zh: "我专攻数学和物理。" },
  { fr: "Les médias ont une grande influence sur l'opinion publique.", en: "The media have a great influence on public opinion.", zh: "媒体对公众舆论影响很大。" },
  { fr: "Je suis fier de ma langue et de mes racines.", en: "I am proud of my language and my roots.", zh: "我为我的语言和根源自豪。" },
  { fr: "Nous devons agir ensemble pour protéger la nature.", en: "We must act together to protect nature.", zh: "我们必须共同行动保护自然。" },
  { fr: "Finalement, je suis prêt pour le prochain chapitre de ma vie.", en: "Finally, I am ready for the next chapter of my life.", zh: "终于，我准备好人生的下一章了。" }
];

export const SENTENCES = {
  4:[
    {parts:["Je","m'appelle","Marie","."],target:"My name is Marie.",zh:"我叫玛丽。"},
    {parts:["J'ai","dix","ans","."],target:"I am ten years old.",zh:"我十岁。"},
    {parts:["Je","suis","content","."],target:"I am happy.",zh:"我很高兴。"},
    {parts:["C'est","un","chien","."],target:"It is a dog.",zh:"这是一只狗。"},
    {parts:["Il","y","a","un","chat","."],target:"There is a cat.",zh:"有一只猫。"},
    {parts:["J'ai","une","sœur","."],target:"I have a sister.",zh:"我有一个姐妹。"},
    {parts:["Le","crayon","est","rouge","."],target:"The pencil is red.",zh:"铅笔是红色的。"}
  ],
  5:[
    {parts:["J'aime","le","chocolat","."],target:"I like chocolate.",zh:"我喜欢巧克力。"},
    {parts:["Je","voudrais","de","l'eau","."],target:"I would like some water.",zh:"我想要水。"},
    {parts:["Où","est","la","bibliothèque","?"],target:"Where is the library?",zh:"图书馆在哪里？"},
    {parts:["Il","fait","froid","aujourd'hui","."],target:"It is cold today.",zh:"今天很冷。"},
    {parts:["J'ai","mal","à","la","tête","."],target:"I have a headache.",zh:"我头疼。"}
  ],
  6:[
    {parts:["Hier","j'ai","mangé","une","pomme","."],target:"Yesterday I ate an apple.",zh:"昨天我吃了一个苹果。"},
    {parts:["La","maison","est","grande","et","belle","."],target:"The house is big and beautiful.",zh:"房子又大又漂亮。"},
    {parts:["Nous","avons","visité","la","ville","."],target:"We visited the city.",zh:"我们参观了这座城市。"}
  ],
  7:[
    {parts:["Pourquoi","est-ce","que","tu","pleures","?"],target:"Why are you crying?",zh:"你为什么哭？"},
    {parts:["Je","ne","mange","jamais","de","viande","."],target:"I never eat meat.",zh:"我从不吃肉。"},
    {parts:["Bien","sûr","je","suis","d'accord","."],target:"Of course I agree.",zh:"当然我同意。"}
  ],
  8:[
    {parts:["Je","voudrais","savoir","comment","faire","."],target:"I would like to know how to do it.",zh:"我想知道怎么做。"},
    {parts:["Pourriez-vous","m'aider","s'il","vous","plaît","?"],target:"Could you help me please?",zh:"请问您能帮我吗？"},
    {parts:["Il","faut","que","tu","viennes","demain","."],target:"You must come tomorrow.",zh:"你明天必须来。"}
  ],
  9:[
    {parts:["À","mon","avis","c'est","très","important","."],target:"In my opinion it is very important.",zh:"在我看来这非常重要。"},
    {parts:["Bien","que","je","sois","fatigué","je","travaille","."],target:"Although I am tired I work.",zh:"尽管我很累我还是工作。"}
  ],
  10: G10_BATCH_C_SENTENCES.map(function(s){
    return { parts: frTokenize(s.fr), target: s.en, zh: s.zh };
  })
};
