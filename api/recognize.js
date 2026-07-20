// Vercel Serverless Function: 豆包大模型图像识别代理
// 密钥保存在服务端环境变量 DOUBAO_API_KEY，前端不会接触密钥
// 入参: { image: "<base64 jpeg>" }
// 出参: { description, animals:[{name,confidence}], elapsed_ms, raw }

const { OpenAI } = require('openai');

// 允许的来源（同源部署下不需要 CORS；这里仅作兜底）
const ALLOWED_ORIGINS = [
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  process.env.PROD_URL || null,
  // 本地开发地址（vercel dev 默认端口）
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5500',  // Live Server 默认端口
  'http://127.0.0.1:5500',
].filter(Boolean);

// 简易动物名称校验白名单（关键词命中即视为动物相关）
const ANIMAL_KEYWORDS = [
  '狗', '猫', '鸟', '鱼', '虫', '马', '牛', '羊', '猪', '鸡', '鸭', '鹅', '兔', '鼠', '虎', '狮', '豹',
  '狼', '熊', '鹿', '猴', '蛇', '龟', '蛙', '蝴蝶', '蜜蜂', '蚂蚁', '蜘蛛', '蜻蜓', '萤火虫',
  'dog', 'cat', 'bird', 'fish', 'horse', 'cow', 'sheep', 'pig', 'chicken', 'duck', 'rabbit',
  'mouse', 'tiger', 'lion', 'leopard', 'wolf', 'bear', 'deer', 'monkey', 'snake', 'turtle',
  'frog', 'butterfly', 'bee', 'ant', 'spider', 'dragonfly', 'firefly', 'animal'
];

function isAnimalRelated(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return ANIMAL_KEYWORDS.some(k => lower.includes(k));
}

function extractAnimals(content) {
  // 尝试让大模型以 JSON 输出，这里做容错解析
  const animals = [];
  try {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed.animals)) {
        return parsed.animals.map(a => ({
          name: String(a.name || '').trim(),
          confidence: Math.max(0, Math.min(1, Number(a.confidence) || 0))
        })).filter(a => a.name);
      }
    }
  } catch (_) { /* fall through */ }
  // 退化为按行解析: "狮子 85%" / "lion: 0.85"
  const lines = content.split(/[\n,;、]+/);
  for (const line of lines) {
    const m = line.match(/^\s*([^\d:：\-\s][^\d:：\-]*?)\s*[:：]?\s*(\d(?:\.\d+)?)\s*%?\s*$/);
    if (m && isAnimalRelated(m[1])) {
      const conf = m[2].length > 1 && Number(m[2]) <= 1 ? Number(m[2]) : Number(m[2]) / 100;
      animals.push({ name: m[1].trim(), confidence: Math.max(0, Math.min(1, conf)) });
    }
  }
  return animals;
}

module.exports = async (req, res) => {
  // 仅允许同源 POST 请求，避免被外部滥用消耗密钥额度
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.length && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: 'Forbidden origin' });
  }

  const apiKey = process.env.DOUBAO_API_KEY;
  const baseURL = process.env.DOUBAO_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
  const model = process.env.DOUBAO_MODEL || 'doubao-vision-pro-32k';

  if (!apiKey) {
    return res.status(500).json({ error: 'Server missing DOUBAO_API_KEY env' });
  }

  const { image } = req.body || {};
  if (!image || typeof image !== 'string') {
    return res.status(400).json({ error: 'Missing image base64 payload' });
  }

  // 限制请求体大小（约 1.5MB base64），避免恶意超大请求
  if (image.length > 2_000_000) {
    return res.status(413).json({ error: 'Image payload too large' });
  }

  const t0 = Date.now();
  try {
    const client = new OpenAI({ apiKey, baseURL });

    // 严格对齐官方示例：doubao-seed-1-6-vision 使用 responses API
    // 只用 user role，把识别指令塞到 input_text
    const response = await client.responses.create({
      model,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: '请识别图中出现的动物，仅返回动物名称及其数量，以严格 JSON 格式返回：{"description":"","animals":[{"name":"中文名","count":数量,"confidence":0.0~1.0}]}。要求：1) 不描述姿态、动作、位置、背景；2) description 字段留空；3) 若图中无动物，animals 返回空数组；4) 不要输出 JSON 之外的任何字符。'
            },
            {
              type: 'input_image',
              image_url: `data:image/jpeg;base64,${image}`
            }
          ]
        }
      ]
    });

    // responses API 返回结构：response.output[].content[].text
    let raw = '';
    if (Array.isArray(response.output)) {
      for (const item of response.output) {
        if (item.type === 'message' && Array.isArray(item.content)) {
          for (const c of item.content) {
            if (typeof c.text === 'string') raw += c.text;
          }
        }
      }
    }
    // 兜底：如果结构变化，尝试常见字段
    if (!raw) raw = response.text || response.content || JSON.stringify(response);
    let description = '';
    let animals = [];

    try {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        description = String(parsed.description || '').trim();
        if (Array.isArray(parsed.animals)) {
          animals = parsed.animals
            .map(a => ({
              name: String(a.name || '').trim(),
              count: Math.max(1, Number(a.count) || 1),
              confidence: Math.max(0, Math.min(1, Number(a.confidence) || 0))
            }))
            .filter(a => a.name);
        }
      }
    } catch (_) {
      // JSON 解析失败，退化提取
      description = raw.slice(0, 200);
      animals = extractAnimals(raw);
    }

    // description 留空时不显示背景描述，只显示动物列表
    if (!description && animals.length === 0) {
      description = '未识别到动物';
    }

    return res.status(200).json({
      description,
      animals,
      elapsed_ms: Date.now() - t0,
      raw
    });
  } catch (e) {
    const msg = e?.message || String(e);
    return res.status(502).json({
      error: 'Doubao API call failed',
      detail: msg.slice(0, 300),
      elapsed_ms: Date.now() - t0
    });
  }
};
