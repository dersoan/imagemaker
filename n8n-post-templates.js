// =========================================================
// CONFIGURAÇÃO DE TESTE
// Para testar um template específico, mude FORCE_TEMPLATE
// para 1, 2, 3, 4, 5, 6 ou 7.
// Em produção, deixe como 0 para rotação automática.
// =========================================================

const input = $input.first();
let webhookTemplate = 0;
try {
  webhookTemplate = $('Webhook').first()?.json?.body?.force_template ?? 0;
} catch {
  // Execuções do cron não passam pelo node Webhook.
}
const FORCE_TEMPLATE = Number(
  input?.json?._force_template ??
  input?.json?.body?.force_template ??
  webhookTemplate ??
  0
);
const FORCE_REGENERATE = Boolean(input?.json?._force_regenerate);


 // 0 = automático | 1 | 2 | 3 | 4 | 5 | 6 | 7

// =========================================================
// UTILITÁRIOS
// =========================================================

function limparTexto(valor) {
  if (!valor) return '';
  return String(valor)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function limitarTexto(valor, limite) {
  const texto = limparTexto(valor);
  if (!texto) return '';
  if (texto.length <= limite) return texto;
  // corta na última palavra inteira (nunca no meio da palavra)
  const corte = texto.substring(0, limite);
  const ultimoEspaco = corte.lastIndexOf(' ');
  return (ultimoEspaco > 0 ? corte.substring(0, ultimoEspaco) : corte).trim() + '...';
}

const LIMITE_LEGENDA_INSTAGRAM = 2200;
const LIMITE_PALAVRAS_RESUMO_LEGENDA = 300;
const HASHTAGS_POST_UNICO = '#casamento #noiva #noivas #casamentos2026 #seucasorio';

function montarLegendaPostUnico(titulo, resumo, urlNoticia) {
  const tituloLimpo = limparTexto(titulo);
  const urlLimpa = limparTexto(urlNoticia);
  const palavrasResumo = limparTexto(resumo).split(/\s+/).filter(Boolean);
  const maxPalavras = Math.min(LIMITE_PALAVRAS_RESUMO_LEGENDA, palavrasResumo.length);

  function resumoComLimite(qtdPalavras) {
    if (qtdPalavras <= 0) return '';
    const foiCortado = qtdPalavras < palavrasResumo.length;
    return palavrasResumo.slice(0, qtdPalavras).join(' ') + (foiCortado ? '...' : '');
  }

  function montar(resumoLegenda) {
    return [
      tituloLimpo,
      resumoLegenda,
      'Quer ler a notícia completa?\nDigite news na DM que enviamos o link para você.',
      urlLimpa ? `Leia a notícia completa: ${urlLimpa}` : '',
      HASHTAGS_POST_UNICO,
    ].filter(Boolean).join('\n\n').trim();
  }

  let legenda = montar(resumoComLimite(maxPalavras));
  if (legenda.length <= LIMITE_LEGENDA_INSTAGRAM) return legenda;

  let baixo = 0;
  let alto = maxPalavras;
  let melhorLegenda = montar('');

  while (baixo <= alto) {
    const meio = Math.floor((baixo + alto) / 2);
    const candidata = montar(resumoComLimite(meio));

    if (candidata.length <= LIMITE_LEGENDA_INSTAGRAM) {
      melhorLegenda = candidata;
      baixo = meio + 1;
    } else {
      alto = meio - 1;
    }
  }

  return melhorLegenda;
}

function escaparHtml(valor) {
  if (!valor) return '';
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const imagensUsadasNaExecucao = new Set();

function normalizarTexto(valor) {
  return limparTexto(valor)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function gerarNumeroPorTexto(texto) {
  const base = normalizarTexto(texto);

  if (!base) return 0;

  let hash = 0;

  for (let i = 0; i < base.length; i++) {
    hash = ((hash << 5) - hash) + base.charCodeAt(i);
    hash = hash & hash;
  }

  return Math.abs(hash);
}

function detectarCategoriaImagem(item) {
  const texto = normalizarTexto([
    item.titulo,
    item.categoria,
    item.slug,
    item.resumo,
    Array.isArray(item.tags) ? item.tags.join(' ') : item.tags,
  ].join(' '));

  // Vestido de noiva / bridal fashion / fashion week
  if (
    (texto.includes('vestido') && texto.includes('noiva')) ||
    texto.includes('bridal fashion') ||
    texto.includes('fashion week') ||
    texto.includes('semana de moda') ||
    texto.includes('bridal') ||
    texto.includes('couture') ||
    texto.includes('passarela') ||
    texto.includes('desfile')
  ) {
    return 'vestido_noiva';
  }

  // Beleza da noiva
  if (
    texto.includes('maquiagem') ||
    texto.includes('beleza') ||
    texto.includes('penteado') ||
    texto.includes('cabelo') ||
    texto.includes('make') ||
    texto.includes('skincare')
  ) {
    return 'beleza_noiva';
  }

  // Decoração
  if (
    texto.includes('decoracao') ||
    texto.includes('decoração') ||
    texto.includes('flores') ||
    texto.includes('buque') ||
    texto.includes('buquê') ||
    texto.includes('mesa') ||
    texto.includes('paleta') ||
    texto.includes('arranjo') ||
    texto.includes('ambientacao') ||
    texto.includes('ambientação') ||
    texto.includes('cenografia')
  ) {
    return 'decoracao';
  }

  // Buffet / gastronomia
  if (
    texto.includes('buffet') ||
    texto.includes('menu') ||
    texto.includes('gastronomia') ||
    texto.includes('comida') ||
    texto.includes('bolo') ||
    texto.includes('doces') ||
    texto.includes('bebidas') ||
    texto.includes('jantar') ||
    texto.includes('coquetel')
  ) {
    return 'buffet';
  }

  // Destino / praia / campo
  if (
    texto.includes('destino') ||
    texto.includes('praia') ||
    texto.includes('viagem') ||
    texto.includes('campo') ||
    texto.includes('fazenda') ||
    texto.includes('destination') ||
    texto.includes('ilha') ||
    texto.includes('resort') ||
    texto.includes('lugar para casar') ||
    texto.includes('local para casar')
  ) {
    return 'destino';
  }

  // Alianças / joias
  if (
    texto.includes('alianca') ||
    texto.includes('aliança') ||
    texto.includes('aliancas') ||
    texto.includes('alianças') ||
    texto.includes('anel') ||
    texto.includes('joia') ||
    texto.includes('jóia') ||
    texto.includes('joias') ||
    texto.includes('jóias')
  ) {
    return 'aliancas';
  }

  // Planejamento / checklist / orçamento / fornecedores
  if (
    texto.includes('checklist') ||
    texto.includes('orcamento') ||
    texto.includes('orçamento') ||
    texto.includes('planejamento') ||
    texto.includes('convidados') ||
    texto.includes('contratar') ||
    texto.includes('fornecedor') ||
    texto.includes('fornecedores') ||
    texto.includes('organizacao') ||
    texto.includes('organização') ||
    texto.includes('cronograma')
  ) {
    return 'planejamento';
  }

  // Noiva genérico
  if (
    texto.includes('noiva') ||
    texto.includes('noivas') ||
    texto.includes('casamento') ||
    texto.includes('casamentos')
  ) {
    return 'casamento';
  }

  return 'casamento';
}

function categoriaExigeImagemEspecifica(item) {
  const categoria = detectarCategoriaImagem(item);

  return [
    'vestido_noiva',
    'beleza_noiva',
    'decoracao',
    'buffet',
    'aliancas',
  ].includes(categoria);
}

function escolherImagemFallback(item) {
  const categoriaImagem = detectarCategoriaImagem(item);

  const imagensPorCategoria = {
    vestido_noiva: [
      'https://images.unsplash.com/photo-1525258946800-98cfd641d0de?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1594552072238-b8a33785b261?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1591604466107-ec97de577aff?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1583939003579-730e3918a45a?q=80&w=1600&auto=format&fit=crop',
    ],

    beleza_noiva: [
      'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1496747611176-843222e1e57c?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?q=80&w=1600&auto=format&fit=crop',
    ],

    decoracao: [
      'https://images.unsplash.com/photo-1519225421980-715cb0215aed?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1529636798458-92182e662485?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1478146896981-b80fe463b330?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1507504031003-b417219a0fde?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?q=80&w=1600&auto=format&fit=crop',
    ],

    buffet: [
      'https://images.unsplash.com/photo-1555244162-803834f70033?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1543352634-a1c51d9f1fa7?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1565538810643-b5bdb714032a?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=1600&auto=format&fit=crop',
    ],

    destino: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1460978812857-470ed1c77af0?q=80&w=1600&auto=format&fit=crop',
    ],

    aliancas: [
      'https://images.unsplash.com/photo-1520854221256-17451cc331bf?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1606216794074-735e91aa2c92?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?q=80&w=1600&auto=format&fit=crop',
    ],

    planejamento: [
      'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1515378791036-0648a3ef77b2?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1517842645767-c639042777db?q=80&w=1600&auto=format&fit=crop',
    ],

    casamento: [
      'https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1523438885200-e635ba2c371e?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1465495976277-4387d4b0e4a6?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1509610973147-232dfea52a97?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1524824267900-2fa9cbf7a506?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1606216794074-735e91aa2c92?q=80&w=1600&auto=format&fit=crop',
    ],
  };

  const imagens = imagensPorCategoria[categoriaImagem] || imagensPorCategoria.casamento;

  const textoBase = [
    item.titulo,
    item.slug,
    item.categoria,
    item.resumo,
    categoriaImagem,
  ].join(' ');

  let indice = gerarNumeroPorTexto(textoBase) % imagens.length;

  for (let tentativa = 0; tentativa < imagens.length; tentativa++) {
    const imagem = imagens[indice];

    if (!imagensUsadasNaExecucao.has(imagem)) {
      imagensUsadasNaExecucao.add(imagem);
      return imagem;
    }

    indice = (indice + 1) % imagens.length;
  }

  return imagens[0];
}

function escolherImagem(item) {
  const imagemCapa =
    limparTexto(item.imagem_capa) ||
    limparTexto(item.imagem_original) ||
    limparTexto(item.image_url);

  // Prefere SEMPRE a foto real do artigo (imagem_capa) quando existir e ainda
  // não tiver sido usada nesta execução. O pool curado por categoria
  // (escolherImagemFallback) vira só fallback, quando falta imagem_capa.
  // Antes: categorias vestido/beleza/decoracao/buffet/aliancas descartavam a
  // imagem_capa e usavam sempre o pool — gerava foto genérica/repetida.
  if (imagemCapa && !imagensUsadasNaExecucao.has(imagemCapa)) {
    imagensUsadasNaExecucao.add(imagemCapa);
    return imagemCapa;
  }

  return escolherImagemFallback(item);
}

function gerarTituloCurto(tituloOriginal) {
  const titulo = limparTexto(tituloOriginal);

  if (!titulo) {
    return {
      antes: 'Inspirações para',
      destaque: 'casamento',
      depois: 'em 2026',
    };
  }

  let tituloLimpo = titulo
    .replace(/\b(conheça|veja|confira|saiba|descubra|entenda)\b/gi, '')
    .replace(/\btendências\b/gi, 'ideias')
    .replace(/\btendencias\b/gi, 'ideias')
    .replace(/\btendência\b/gi, 'ideia')
    .replace(/\btendencia\b/gi, 'ideia')
    .replace(/\s+/g, ' ')
    .trim();

  const textoNormalizado = normalizarTexto(tituloLimpo);

  const anoMatch = tituloLimpo.match(/\b(20\d{2})\b/);
  const ano = anoMatch ? anoMatch[1] : '';

  tituloLimpo = tituloLimpo
    .replace(/\b(20\d{2})\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const numeroMatch = tituloLimpo.match(/^(\d+)\s+/);
  const numero = numeroMatch ? numeroMatch[1] : '';

  if (numero) {
    tituloLimpo = tituloLimpo.replace(/^(\d+)\s+/, '').trim();
  }

  if (
    textoNormalizado.includes('vestido') &&
    textoNormalizado.includes('noiva')
  ) {
    return {
      antes: numero ? `${numero} vestidos de noiva` : 'Vestidos de noiva',
      destaque: textoNormalizado.includes('semana de moda')
        ? 'da Semana de Moda'
        : 'para se inspirar',
      depois: ano ? `em ${ano}` : '',
    };
  }

  if (
    textoNormalizado.includes('decoracao') ||
    textoNormalizado.includes('decoração')
  ) {
    return {
      antes: numero ? `${numero} ideias de decoração` : 'Ideias de decoração',
      destaque: 'para casamento',
      depois: ano ? `em ${ano}` : '',
    };
  }

  if (
    textoNormalizado.includes('maquiagem') ||
    textoNormalizado.includes('beleza') ||
    textoNormalizado.includes('penteado')
  ) {
    return {
      antes: numero ? `${numero} inspirações de beleza` : 'Beleza da noiva',
      destaque: textoNormalizado.includes('noiva') ? 'para noivas' : 'para casamento',
      depois: ano ? `em ${ano}` : '',
    };
  }

  if (
    textoNormalizado.includes('destino') ||
    textoNormalizado.includes('praia') ||
    textoNormalizado.includes('viagem')
  ) {
    return {
      antes: numero ? `${numero} lugares para casar` : 'Casamento de destino',
      destaque: textoNormalizado.includes('praia') ? 'na praia' : 'com estilo',
      depois: ano ? `em ${ano}` : '',
    };
  }

  if (
    textoNormalizado.includes('buffet') ||
    textoNormalizado.includes('menu') ||
    textoNormalizado.includes('gastronomia') ||
    textoNormalizado.includes('bolo') ||
    textoNormalizado.includes('doces')
  ) {
    return {
      antes: numero ? `${numero} ideias para o buffet` : 'Ideias para o buffet',
      destaque: 'do casamento',
      depois: ano ? `em ${ano}` : '',
    };
  }

  if (
    textoNormalizado.includes('alianca') ||
    textoNormalizado.includes('aliança') ||
    textoNormalizado.includes('aliancas') ||
    textoNormalizado.includes('alianças')
  ) {
    return {
      antes: numero ? `${numero} ideias de alianças` : 'Alianças de casamento',
      destaque: 'para se inspirar',
      depois: ano ? `em ${ano}` : '',
    };
  }

  if (
    textoNormalizado.includes('fornecedor') ||
    textoNormalizado.includes('fornecedores') ||
    textoNormalizado.includes('orcamento') ||
    textoNormalizado.includes('orçamento') ||
    textoNormalizado.includes('checklist') ||
    textoNormalizado.includes('planejamento')
  ) {
    return {
      antes: numero ? `${numero} cuidados no planejamento` : 'Planejamento do casamento',
      destaque: 'sem dor de cabeça',
      depois: ano ? `em ${ano}` : '',
    };
  }

  let palavras = tituloLimpo
    .split(' ')
    .map(palavra => palavra.trim())
    .filter(Boolean);

  if (numero) {
    palavras.unshift(numero);
  }

  if (palavras.length > 8) {
    palavras = palavras.slice(0, 8);
  }

  const metade = Math.ceil(palavras.length / 2);

  return {
    antes: palavras.slice(0, metade).join(' '),
    destaque: palavras.slice(metade, metade + 3).join(' '),
    depois: ano ? `em ${ano}` : palavras.slice(metade + 3).join(' '),
  };
}

// =========================================================
// NOVO — Monta o título de capa a partir do titulo_card (manchete da IA)
// Curto e completo, então a divisão antes/destaque nunca deixa
// pedaço solto ("...TUDO QUE"). Cai no heurístico antigo se não houver card.
// =========================================================

function gerarTituloDoCard(tituloCard, tituloOriginal) {
  const card = limparTexto(tituloCard);
  if (!card) return gerarTituloCurto(tituloOriginal);

  // 1) Se houver ":" , divide nele (quebra natural — "Tema: subtítulo").
  const dois = card.indexOf(':');
  if (dois > 0 && dois < card.length - 1) {
    return {
      antes: card.slice(0, dois + 1).trim(),
      destaque: card.slice(dois + 1).trim(),
      depois: '',
    };
  }

  const palavras = card.split(' ').filter(Boolean);
  if (palavras.length <= 2) {
    return { antes: '', destaque: card, depois: '' };
  }

  // 2) Senão, destaque = últimas até 3 palavras (cabe numa linha), resto fica em "antes".
  const destaqueCount = Math.min(3, palavras.length - 1);
  const corte = palavras.length - destaqueCount;
  return {
    antes: palavras.slice(0, corte).join(' '),
    destaque: palavras.slice(corte).join(' '),
    depois: '',
  };
}

// =========================================================
// LÓGICA DE ROTAÇÃO AUTOMÁTICA
// =========================================================

function escolherTemplate() {
  if (FORCE_TEMPLATE >= 1 && FORCE_TEMPLATE <= 7) return FORCE_TEMPLATE;

  const agora  = new Date();
  const dia    = ((agora.getDate() - 1) % 5) + 1;
  const manha  = agora.getHours() < 13;

  const tabela = {
    1: { manha: 1, tarde: 2 },
    2: { manha: 3, tarde: 4 },
    3: { manha: 5, tarde: 1 },
    4: { manha: 2, tarde: 3 },
    5: { manha: 4, tarde: 5 },
  };

  return manha ? tabela[dia].manha : tabela[dia].tarde;
}

// =========================================================
// RODAPÉ COMPARTILHADO (T01, T02, T04)
// Mantém selo verifid + pílula com texto CTA em duas linhas
// =========================================================

function htmlRodape() {
  return `<footer class="poster__foot">
    <img class="brand__selo" src="https://seucasorio.com.br/noticias/verifid.png" alt="seuCasorio" />
    <div class="url">Texto na <span class="kw">Legenda</span><br>Siga-Nos</div>
  </footer>`;
}

function cssRodape() {
  return `.poster__foot { background: #f0b829; block-size: 120px; padding: 0 32px; display: flex; justify-content: space-between; align-items: center; position: relative; }
.brand__selo { block-size: 72px; inline-size: auto; object-fit: contain; display: block; }
.url { position: relative; align-self: flex-start; background: #fff; color: #4a2c1c; border-radius: 0 0 50% 50% / 0 0 24px 24px; padding: 12px 40px 20px; font-weight: 800; font-size: 24px; line-height: 1.25; text-align: center; }
.kw { background: #e05c2a; color: #fff; border-radius: 8px; padding: 2px 12px; font-weight: 800; }`;
}

// =========================================================
// TEMPLATE 01 — Editorial: texto em cima, foto embaixo
// =========================================================

function gerarTemplate01(tituloPost, resumo, imagemCapa) {
  const html = `
<article class="poster">
  <header class="poster__top">
    <div class="kicker">Guia &mdash; <span class="kicker__upp">CASAMENTOS 2026</span></div>
    <h1 class="headline">
      ${escaparHtml(tituloPost.antes)}
      ${tituloPost.destaque ? `<em>${escaparHtml(tituloPost.destaque)}</em>` : ''}
      ${tituloPost.depois ? escaparHtml(tituloPost.depois) : ''}
    </h1>
    <p class="lede">${escaparHtml(resumo)}</p>
  </header>
  <figure class="poster__img">
    <img src="${escaparHtml(imagemCapa)}" alt="" />
  </figure>
  ${htmlRodape()}
</article>`.trim();

  const css = `
:root {
  --bg: #4a2c1c; --cream: #f5e8d6; --mustard: #d4a574;
  --yellow: #f0b829; --ink-dark: #4a2c1c; --ink-mute: #7a5a3e;
}
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: transparent; font-family: "Manrope", system-ui, sans-serif; }
.poster { inline-size: 1080px; block-size: 1430px; background: var(--bg); color: var(--cream); display: grid; grid-template-rows: auto 1fr auto; overflow: hidden; }
.poster__top { padding: 64px 72px 32px; }
.kicker { font-weight: 700; font-size: 22px; letter-spacing: .04em; color: var(--cream); margin-block-end: 28px; }
.kicker__upp { text-transform: uppercase; letter-spacing: .08em; }
.headline { font-family: "Manrope", sans-serif; font-weight: 800; font-size: 84px; line-height: 1.0; letter-spacing: -0.025em; color: var(--cream); margin: 0 0 28px; }
.headline em { font-style: normal; font-weight: 800; color: var(--mustard); }
.lede { font-weight: 500; font-size: 28px; line-height: 1.35; color: var(--mustard); max-inline-size: 100%; margin: 0; text-align: justify; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.poster__img { margin: 24px 72px 0; border-radius: 14px; overflow: hidden; background: #e6dccb; }
.poster__img img { display: block; inline-size: 100%; block-size: 100%; object-fit: cover; }
${cssRodape()}
`.trim();

  return { html, css, fonts: 'Manrope:500,700,800|Cormorant+Garamond:ital,wght@1,500;1,600' };
}

// =========================================================
// TEMPLATE 02 — Editorial: foto em cima, texto embaixo
// =========================================================

function gerarTemplate02(tituloPost, resumo, imagemCapa) {
  const html = `
<article class="poster">
  <figure class="poster__img">
    <img src="${escaparHtml(imagemCapa)}" alt="" />
  </figure>
  <div class="poster__bottom">
    <div class="kicker">Inspira&ccedil;&atilde;o &bull; <span class="kicker__upp">Casamentos 2026</span></div>
    <h1 class="headline">
      ${escaparHtml(tituloPost.antes)}
      ${tituloPost.destaque ? `<em>${escaparHtml(tituloPost.destaque)}</em>` : ''}
      ${tituloPost.depois ? escaparHtml(tituloPost.depois) : ''}
    </h1>
    <p class="lede">${escaparHtml(resumo)}</p>
  </div>
  ${htmlRodape()}
</article>`.trim();

  const css = `
:root {
  --bg: #4a2c1c; --cream: #f5e8d6; --mustard: #d4a574;
  --yellow: #f0b829; --ink-dark: #4a2c1c; --ink-mute: #7a5a3e;
}
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: transparent; font-family: "Manrope", system-ui, sans-serif; }
.poster { inline-size: 1080px; block-size: 1430px; background: var(--bg); color: var(--cream); display: grid; grid-template-rows: 710px 1fr auto; overflow: hidden; }
.poster__img { inline-size: 100%; block-size: 710px; overflow: hidden; background: #e6dccb; position: relative; margin: 0; }
.poster__img img { display: block; inline-size: 100%; block-size: 100%; object-fit: cover; }
.poster__img::after { content: "EDICAO - 2026"; position: absolute; inset-block-start: 36px; inset-inline-end: 0; background: var(--yellow); color: var(--ink-dark); font-family: "Manrope", sans-serif; font-weight: 700; font-size: 22px; letter-spacing: .08em; padding: 10px 36px 10px 28px; clip-path: polygon(12px 0%, 100% 0%, 100% 100%, 0% 100%); }
.poster__bottom { padding: 48px 72px 0; display: flex; flex-direction: column; justify-content: center; gap: 24px; }
.kicker { font-weight: 700; font-size: 20px; color: var(--mustard); text-transform: uppercase; letter-spacing: .1em; }
.kicker__upp { text-transform: uppercase; }
.headline { font-family: "Manrope", sans-serif; font-weight: 800; font-size: 76px; line-height: 1.0; letter-spacing: -0.025em; color: var(--cream); margin: 0; }
.headline em { font-style: normal; font-weight: 800; color: var(--mustard); }
.lede { font-weight: 500; font-size: 26px; line-height: 1.35; color: var(--mustard); max-inline-size: 88%; margin: 0; display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }
${cssRodape()}
`.trim();

  return { html, css, fonts: 'Manrope:500,700,800|Cormorant+Garamond:ital,wght@1,500;1,600' };
}

// =========================================================
// TEMPLATE 03 — Brutalist dark (sem alteração)
// =========================================================

function gerarTemplate03(tituloPost, resumo, imagemCapa) {
  const tituloUpper = escaparHtml(tituloPost.antes.toUpperCase());
  const destaqueUpper = tituloPost.destaque ? escaparHtml(tituloPost.destaque.toUpperCase()) : '';
  const depoisUpper = tituloPost.depois ? escaparHtml(tituloPost.depois.toUpperCase()) : '';

  const html = `
<article class="poster">
  <figure class="poster__img">
    <img src="${escaparHtml(imagemCapa)}" alt="" />
    <div class="stamp" aria-hidden="true">
      <div>
        <div class="stamp__big">2026</div>
        <span class="stamp__sm">edi&ccedil;&atilde;o especial</span>
      </div>
    </div>
    <div class="ticker" aria-hidden="true"></div>
  </figure>
  <section class="poster__bottom">
    <div class="eyebrow">Guia &middot; Casamentos &middot; seuCas&oacute;rio</div>
    <h1 class="headline">
      ${tituloUpper}
      ${destaqueUpper ? `<span class="mark"><span class="ital">${destaqueUpper}</span></span>` : ''}
      ${depoisUpper}
    </h1>
    <p class="lede">${escaparHtml(resumo)}</p>
    <div class="meta">
      <span>seucasorio.com.br / noticias</span>
      <span class="arrow">veja mais &rarr;</span>
    </div>
  </section>
  ${htmlRodape()}
</article>`.trim();

  const css = `
:root {
  --bg: #0d0d0d; --ink: #f4f1ea; --ink-mute: #bcb6a7;
  --accent: #f0b829; --dash: #3a352c;
  --img-base: #4a4538; --img-line: #3d382c;
}
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: transparent; font-family: "Space Grotesk", system-ui, sans-serif; }
.poster { inline-size: 1080px; block-size: 1430px; background: var(--bg); color: var(--ink); display: grid; grid-template-rows: 1fr auto auto; overflow: hidden; position: relative; }
.poster__img { position: relative; overflow: hidden; margin: 0; border-block-end: 8px solid var(--accent); background: var(--img-base); }
.poster__img img { display: block; inline-size: 100%; block-size: 100%; object-fit: cover; }
.stamp { position: absolute; inset-block-start: 56px; inset-inline-end: 56px; inline-size: 200px; block-size: 200px; border-radius: 50%; background: var(--accent); color: var(--bg); display: grid; place-items: center; transform: rotate(-12deg); border: 3px solid var(--bg); box-shadow: 0 0 0 9px var(--accent); text-align: center; z-index: 4; }
.stamp__big { font-family: "Fraunces", serif; font-style: italic; font-weight: 500; font-size: 64px; line-height: 1; letter-spacing: -.03em; }
.stamp__sm { display: block; font-family: "DM Mono", monospace; font-size: 13px; letter-spacing: .18em; text-transform: uppercase; margin-block-start: 6px; }
.ticker { position: absolute; inset-inline-start: 0; inset-inline-end: 0; inset-block-end: 0; background: var(--accent); color: var(--bg); padding: 16px 0; overflow: hidden; white-space: nowrap; font-family: "DM Mono", monospace; font-weight: 500; font-size: 18px; letter-spacing: .16em; text-transform: uppercase; }
.ticker::before { content: "★ CASAMENTOS 2026   ★   ORCAMENTO ACESSIVEL   ★   GUIA COMPLETO   ★   VEJA MAIS   ★   CASAMENTOS 2026   ★   ORCAMENTO ACESSIVEL   ★   GUIA COMPLETO   ★"; padding-inline-start: 48px; display: inline-block; }
.poster__bottom { background: var(--bg); padding: 64px 80px; color: var(--ink); position: relative; }
.eyebrow { font-family: "DM Mono", monospace; font-size: 18px; letter-spacing: .24em; text-transform: uppercase; color: var(--accent); margin-block-end: 32px; display: flex; align-items: center; gap: 16px; }
.eyebrow::before { content: ""; inline-size: 14px; block-size: 14px; background: var(--accent); border-radius: 50%; }
.headline { font-family: "Space Grotesk", sans-serif; font-weight: 700; font-size: 88px; line-height: 0.92; letter-spacing: -0.035em; margin: 0 0 32px; text-transform: uppercase; color: var(--ink); }
.headline .mark { background: var(--accent); color: var(--bg); padding: 0 .15em; display: inline-block; transform: skew(-6deg); }
.headline .ital { font-family: "Fraunces", serif; font-style: italic; font-weight: 500; text-transform: none; letter-spacing: -.03em; }
.lede { font-size: 26px; line-height: 1.4; color: var(--ink-mute); max-inline-size: 100%; margin: 0; }
.meta { margin-block-start: 48px; padding-block-start: 26px; border-block-start: 1px dashed var(--dash); display: flex; justify-content: space-between; align-items: center; font-family: "DM Mono", monospace; font-size: 18px; letter-spacing: .18em; text-transform: uppercase; color: var(--ink-mute); }
.meta .arrow { color: var(--accent); font-family: "Space Grotesk", sans-serif; font-size: 30px; letter-spacing: 0; text-transform: none; }
${cssRodape()}
`.trim();

  return { html, css, fonts: 'Space+Grotesk:wght@500;700|Fraunces:ital,opsz,wght@1,9..144,500|DM+Mono:wght@400;500' };
}

// =========================================================
// TEMPLATE 04 — Default original (fundo creme, checker, badge)
// =========================================================

function gerarTemplate04(tituloPost, resumo, imagemCapa) {
  const logoUrl = 'https://seucasorio.com.br/noticias/iconredondo.png';

  const html = `
<article class="poster">
  <header class="top">
    <h1 class="headline">
      ${escaparHtml(tituloPost.antes)}
      ${tituloPost.destaque ? `<span class="hl">${escaparHtml(tituloPost.destaque)}</span>` : ''}
      ${tituloPost.depois ? escaparHtml(tituloPost.depois) : ''}
    </h1>
    <p class="lede">${escaparHtml(resumo)}</p>
    <div class="checker" aria-hidden="true">
      <span></span><span></span><span></span>
      <span></span><span></span><span></span>
      <span></span><span></span><span></span>
      <span></span><span></span><span></span>
      <span></span><span></span><span></span>
    </div>
    <div class="badge" aria-label="Logo Seu Casório">
      <img src="${escaparHtml(logoUrl)}" alt="Seu Casório" />
    </div>
  </header>
  <figure class="image">
    <img src="${escaparHtml(imagemCapa)}" alt="" />
  </figure>
  ${htmlRodape()}
</article>`.trim();

  const css = `
:root { --bg: #f6f1e7; --ink: #1d1d1b; --muted: #1f1f1d; --accent: #f0b829; --badge: #3a2417; --cream: #f6f1e7; --ink-dark: #1d1d1b; }
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: transparent; font-family: "Inter", system-ui, sans-serif; color: var(--ink); }
.poster { inline-size: 1080px; block-size: 1430px; background: var(--bg); position: relative; overflow: hidden; display: grid; grid-template-rows: 620px 690px 120px; }
.top { padding: 64px 78px 0; position: relative; background: var(--bg); overflow: visible; z-index: 3; }
.headline { font-family: "Inter", system-ui, sans-serif; font-weight: 700; font-size: 76px; line-height: 0.94; letter-spacing: -0.075em; color: var(--ink); margin: 0 0 34px; max-inline-size: 880px; }
.headline .hl { font-weight: 700; color: var(--accent); white-space: nowrap; }
.lede { font-weight: 400; font-size: 33px; line-height: 1.18; letter-spacing: -0.045em; color: var(--muted); max-inline-size: 100%; margin: 0; text-align: justify; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.checker { --cell: 30px; position: absolute; inset-inline-start: 0; inset-block-end: -104px; inline-size: calc(var(--cell) * 3); block-size: calc(var(--cell) * 5); display: grid; grid-template-columns: repeat(3, var(--cell)); grid-template-rows: repeat(5, var(--cell)); z-index: 5; pointer-events: none; }
.checker span { background: transparent; display: block; }
.checker span:nth-child(1), .checker span:nth-child(2), .checker span:nth-child(4), .checker span:nth-child(6), .checker span:nth-child(7), .checker span:nth-child(8), .checker span:nth-child(11), .checker span:nth-child(13) { background: var(--accent); }
.checker span:nth-child(5), .checker span:nth-child(10) { background: #ffffff; }
.badge { position: absolute; inset-inline-end: 58px; inset-block-end: -78px; inline-size: 156px; block-size: 156px; border-radius: 50%; overflow: hidden; z-index: 120; box-shadow: 0 14px 28px -12px rgba(0,0,0,.38); }
.badge img { inline-size: 100%; block-size: 100%; object-fit: cover; display: block; }
.image { position: relative; inline-size: calc(100% - 40px); block-size: 690px; margin: 0 0 0 40px; overflow: hidden; background: #d8d2c4; }
.image img { inline-size: 100%; block-size: 100%; object-fit: cover; object-position: center center; display: block; z-index: 1; }
.image::after { content: ""; position: absolute; inset: 0; background: rgba(0,0,0,.12); pointer-events: none; }
${cssRodape()}
`.trim();

  return { html, css, fonts: 'Inter:400,500,600,700,800,900', height: 1430 };
}

// =========================================================
// TEMPLATE 05 — Acid Poster (sem alteração)
// =========================================================

function gerarTemplate05(tituloPost, resumo, imagemCapa, urlNoticia) {
  const tituloUpper = escaparHtml(tituloPost.antes.toUpperCase());
  const destaqueUpper = tituloPost.destaque ? escaparHtml(tituloPost.destaque.toUpperCase()) : '';
  const depoisUpper = tituloPost.depois ? escaparHtml(tituloPost.depois.toUpperCase()) : '';

  const html = `
<article class="poster">
  <figure class="poster__img">
    <img src="${escaparHtml(imagemCapa)}" alt="" />
    <span class="marker">casamentos &middot; 2026</span>
    <div class="counter"><b>2026</b>edi&ccedil;&atilde;o especial</div>
  </figure>
  <section class="poster__body">
    <div class="eyebrow"><span>Guia Casamentos 2026</span></div>
    <h1 class="headline">
      ${tituloUpper}
      ${destaqueUpper ? `<span class="accent">${destaqueUpper}</span>` : ''}
      ${depoisUpper}
    </h1>
    <p class="lede">${escaparHtml(resumo)}</p>
  </section>
  ${htmlRodape()}
</article>`.trim();

  const css = `
:root {
  --bg: #4a2c1c; --ink: #e8e4d8; --gold: #d4ae3a;
  --accent: #d4a89c; --muted: #a78a6e; --line: #6d4a30;
  --pad-x: 56px; --pad-x-img: 24px; --img-h: 420px;
}
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: transparent; font-family: "Space Grotesk", system-ui, sans-serif; }
.poster { inline-size: 1080px; block-size: 1430px; background: var(--bg); color: var(--ink); display: grid; grid-template-rows: auto 1fr auto; overflow: hidden; position: relative; }
.poster::before { content: ""; position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px); background-size: 80px 80px; pointer-events: none; z-index: 0; }
.poster__img { position: relative; block-size: var(--img-h); overflow: hidden; border-block-end: 2px solid var(--accent); margin: 0; z-index: 1; }
.poster__img img { display: block; inline-size: 100%; block-size: 100%; object-fit: cover; }
.marker { position: absolute; inset-inline-start: var(--pad-x-img); inset-block-end: var(--pad-x-img); font-family: "DM Mono", monospace; font-size: 14px; letter-spacing: .2em; text-transform: uppercase; color: var(--accent); background: rgba(42,24,16,.8); padding: 8px 14px; border: 1px solid var(--accent); }
.marker::before { content: "● "; color: var(--accent); }
.counter { position: absolute; inset-inline-end: var(--pad-x-img); inset-block-start: var(--pad-x-img); font-family: "DM Mono", monospace; font-size: 13px; letter-spacing: .2em; text-transform: uppercase; color: var(--ink); text-align: end; }
.counter b { display: block; color: var(--accent); font-weight: 500; }
.poster__body { padding: 28px var(--pad-x) 0; position: relative; z-index: 2; }
.eyebrow { display: flex; gap: 14px; align-items: center; font-family: "DM Mono", monospace; font-size: 14px; letter-spacing: .28em; text-transform: uppercase; color: var(--accent); margin-block-end: 18px; }
.eyebrow::before, .eyebrow::after { content: ""; flex: 1; block-size: 1px; background: var(--muted); }
.headline { font-family: "Space Grotesk", sans-serif; font-weight: 700; font-size: 130px; line-height: .86; letter-spacing: -0.05em; margin: 0; text-transform: uppercase; color: var(--ink); }
.headline .accent { color: var(--accent); }
.headline .out { color: transparent; -webkit-text-stroke: 2px var(--gold); }
.lede { margin: 24px 0 0; font-family: "Space Grotesk", sans-serif; font-weight: 500; font-size: 24px; line-height: 1.4; color: var(--muted); text-align: justify; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
${cssRodape()}
`.trim();

  return { html, css, fonts: 'Space+Grotesk:wght@500;700|DM+Mono:wght@400;500' };
}

// =========================================================
// TEMPLATE 06 — Editorial "Cita&ccedil;&atilde;o" (capa de revista)
// Foto full-bleed + masthead gigante "seuCasório" + frase em destaque.
// Origem: post-citacao.html (imagemaker). Mesma assinatura dos demais —
// recebe tituloPost/resumo/imagemCapa e devolve { html, css, fonts }.
// As fontes (Archivo/Space Mono/Playfair) vão embutidas no <link> do
// próprio HTML para garantir o carregamento no Puppeteer.
// =========================================================

function gerarTemplate06(tituloPost, resumo, imagemCapa) {
  // Nº de "edição" determinístico a partir do título (ex.: Nº 04)
  const num = ('0' + (gerarNumeroPorTexto(tituloPost.antes + tituloPost.destaque) % 99 + 1)).slice(-2);

  // QUOTE = manchete; o trecho em destaque vira serif itálico dourado (minúsculo)
  const quote =
    `${escaparHtml(tituloPost.antes)}` +
    `${tituloPost.destaque ? `<br><span class="serif">${escaparHtml(tituloPost.destaque)}</span>` : ''}` +
    `${tituloPost.depois ? ` ${escaparHtml(tituloPost.depois)}` : ''}`;

  const html = `
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800;900&amp;family=Space+Mono:wght@400;700&amp;family=Playfair+Display:ital,wght@1,500;1,600&amp;display=swap" rel="stylesheet" />
<article class="poster">
  <div class="photo"><img src="${escaparHtml(imagemCapa)}" alt="" /></div>
  <div class="tint" aria-hidden="true"></div>

  <div class="toprule">
    <span>seuCas&oacute;rio &middot; Guia 2026</span>
    <span class="serif">edi&ccedil;&atilde;o especial</span>
    <span>N&ordm; ${num}</span>
  </div>

  <header class="masthead"><h1>seuCas&oacute;rio</h1></header>

  <div class="lead">
    <span class="eyebrow">Inspira&ccedil;&atilde;o &middot; Casamentos 2026</span>
    <span class="quotemark" aria-hidden="true">&ldquo;</span>
    <h2>${quote}</h2>
  </div>

  <div class="bottom">
    <span class="bottom__logo">
      <img src="https://imagemaker.seucasorio.com/storage/LogoRedondo.png" alt="seuCas&oacute;rio" />
    </span>
    <span class="bottom__text">
      <span class="bottom__title">Equipe <span class="serif">seuCas&oacute;rio</span></span>
      <span class="bottom__sub">Guia de Casamentos 2026</span>
    </span>
  </div>
</article>`.trim();

  const css = `
:root { --brown: #3c2517; --brown-d: #2a1810; --cream: #efe6d4; --cream-2: #e4d6bf; --ink: #2a1810; --yellow: #f4c01a; --gold: #b07d2a; --mute: #6f5a45; }
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #1b1009; font-family: "Archivo", system-ui, sans-serif; color: var(--ink); }
.poster { width: 1080px; height: 1430px; position: relative; overflow: hidden; background: var(--cream-2); isolation: isolate; }
.photo { position: absolute; inset: 0; z-index: 0; }
.photo img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 42%; display: block; }
.tint { position: absolute; inset: 0; z-index: 1; pointer-events: none; background: linear-gradient(180deg, rgba(228,214,191,.95) 0%, rgba(228,214,191,.88) 30%, rgba(228,214,191,.55) 46%, rgba(228,214,191,.12) 58%, rgba(228,214,191,0) 66%), linear-gradient(0deg, rgba(42,24,16,.90) 0%, rgba(42,24,16,.40) 22%, rgba(42,24,16,0) 38%), linear-gradient(110deg, rgba(60,37,23,.16) 0%, rgba(60,37,23,0) 60%); }
.toprule { position: absolute; top: 26px; left: 56px; right: 56px; z-index: 4; display: flex; align-items: center; justify-content: space-between; padding-bottom: 12px; border-bottom: 2px solid var(--ink); font-family: "Space Mono", monospace; font-weight: 700; font-size: 13px; letter-spacing: .2em; text-transform: uppercase; color: var(--brown); }
.toprule .serif { font-family: "Playfair Display", serif; font-style: italic; font-weight: 500; font-size: 22px; letter-spacing: 0; text-transform: none; color: var(--gold); }
.masthead { position: absolute; top: 92px; left: 56px; right: 56px; z-index: 4; display: flex; align-items: flex-start; justify-content: space-between; }
.masthead h1 { margin: 0; font-family: "Archivo", sans-serif; font-weight: 900; font-size: 132px; line-height: .8; letter-spacing: -.05em; color: var(--ink); text-transform: none; }
.lead { position: absolute; top: 300px; left: 56px; z-index: 4; width: 820px; display: grid; gap: 26px; }
.lead .eyebrow { font-family: "Space Mono", monospace; font-weight: 700; font-size: 14px; letter-spacing: .3em; text-transform: uppercase; color: var(--gold); display: flex; align-items: center; gap: 14px; }
.lead .eyebrow::after { content: ""; width: 64px; height: 2px; background: var(--gold); }
.lead .quotemark { font-family: "Playfair Display", serif; font-style: italic; font-weight: 600; font-size: 140px; line-height: .4; height: 70px; color: var(--gold); }
.lead h2 { margin: 0; font-family: "Archivo", sans-serif; font-weight: 800; font-size: 64px; line-height: 1.02; letter-spacing: -.03em; text-transform: uppercase; color: var(--ink); text-wrap: balance; }
.lead h2 .serif { font-family: "Playfair Display", serif; font-style: italic; font-weight: 500; text-transform: none; letter-spacing: -.01em; color: var(--gold); background: var(--ink); padding: 10px 18px; display: inline-block; }
.bottom { position: absolute; left: 56px; right: 56px; bottom: 56px; z-index: 4; display: grid; grid-template-columns: auto 1fr; gap: 30px; align-items: center; }
.bottom__logo { width: 96px; height: 96px; display: grid; place-items: center; flex: none; }
.bottom__logo img { width: 100%; height: 100%; object-fit: contain; }
.bottom__text { display: grid; gap: 8px; }
.bottom__title { margin: 0; font-family: "Archivo", sans-serif; font-weight: 800; font-size: 60px; line-height: .9; letter-spacing: -.035em; text-transform: uppercase; color: var(--cream); }
.bottom__title .serif { font-family: "Playfair Display", serif; font-style: italic; font-weight: 500; text-transform: none; letter-spacing: -.01em; color: var(--yellow); }
.bottom__sub { font-family: "Space Mono", monospace; font-weight: 700; font-size: 22px; letter-spacing: .14em; text-transform: uppercase; color: var(--cream); }
`.trim();

  return { html, css, fonts: 'Archivo:wght@500;600;700;800;900&family=Space+Mono:wght@400;700&family=Playfair+Display:ital,wght@1,500;1,600' };
}

// =========================================================
// TEMPLATE 07 — Editorial dourado SeuCasório
// Adaptação do pacote "Template HTML feed 4_5" para HTML puro.
// =========================================================

function gerarTemplate07(tituloPost, resumo, imagemCapa) {
  const partes = [tituloPost.antes, tituloPost.destaque, tituloPost.depois]
    .map(limparTexto)
    .filter(Boolean);
  const destaque = partes.length > 1 ? partes.pop() : '';
  const principal = partes.length ? partes : [destaque || 'Seu Casório'];
  const totalCaracteres = principal.join(' ').length + destaque.length;
  const maiorPalavra = Math.max(
    0,
    ...[...principal, destaque]
      .join(' ')
      .split(/\s+/)
      .map(palavra => palavra.length)
  );
  const tamanhoBase = totalCaracteres > 70
    ? 70
    : totalCaracteres > 55
      ? 78
      : totalCaracteres > 42
        ? 86
        : totalCaracteres > 30
          ? 104
          : 126;
  const limitePalavra = maiorPalavra >= 16 ? 66 : maiorPalavra >= 12 ? 82 : 126;
  const tamanhoTitulo = Math.min(tamanhoBase, limitePalavra);
  const resumoCurto = limitarTexto(resumo, 72) || 'Inspirações e informação para o seu grande dia.';
  const logoUrl = 'https://seucasorio.com.br/noticias/rodape.png';

  const html = `
<article class="poster poster--gold">
  <figure class="photo">
    <img src="${escaparHtml(imagemCapa)}" alt="" />
  </figure>
  <div class="photo-fade" aria-hidden="true"></div>
  <div class="left-panel" aria-hidden="true"></div>

  <div class="corner" aria-hidden="true">
    <span></span><span></span><span></span>
  </div>

  <header class="kicker">
    <span class="kicker__icon" aria-hidden="true"><i></i><i></i><i></i></span>
    <span>Guia prático</span>
  </header>

  <h1 class="headline" style="font-size:${tamanhoTitulo}px">
    <span class="headline__base">${principal.map(escaparHtml).join('<br />')}</span>
    ${destaque ? `<span class="headline__accent">${escaparHtml(destaque)}</span>` : ''}
  </h1>

  <aside class="callout">
    <span class="callout__check" aria-hidden="true"></span>
    <span class="callout__copy">
      <strong>Leia a matéria</strong>
      <span>${escaparHtml(resumoCurto)}</span>
    </span>
  </aside>

  <svg class="wave" viewBox="0 0 1080 330" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 82 C 300 14 700 54 1080 148 L1080 330 L0 330 Z" fill="#C8870B"></path>
    <path d="M0 96 C 300 28 700 68 1080 162 L1080 330 L0 330 Z" fill="#3B2A1C"></path>
  </svg>

  <div class="brand">
    <img src="${escaparHtml(logoUrl)}" alt="SeuCasório" />
    <span>Seu dia, do seu jeito</span>
  </div>

  <footer class="tagline">Informação para planejar o seu grande dia.</footer>
</article>`.trim();

  const css = `
:root { --cream:#fbf7ef; --brown:#3b2a1c; --gold:#c8870b; --yellow:#e9a81c; }
*, *::before, *::after { box-sizing: border-box; }
html, body { margin:0; padding:0; background:transparent; font-family:"Montserrat",system-ui,sans-serif; }
.poster--gold { position:relative; width:1080px; height:1430px; overflow:hidden; background:var(--cream); color:var(--brown); }
.photo { position:absolute; inset:0 0 0 38%; margin:0; overflow:hidden; background:#ddd3c4; }
.photo img { width:100%; height:100%; object-fit:cover; object-position:center; display:block; }
.photo-fade { position:absolute; inset:0 0 0 30%; width:30%; background:linear-gradient(to right,var(--cream) 0%,var(--cream) 36%,rgba(251,247,239,.87) 62%,rgba(251,247,239,0) 100%); }
.left-panel { position:absolute; inset:0 auto 0 0; width:31%; background:var(--cream); }
.corner { position:absolute; inset:0 auto auto 0; width:130px; height:130px; }
.corner span { position:absolute; display:block; background:var(--gold); }
.corner span:nth-child(1) { width:76px; height:76px; inset:0 auto auto 0; }
.corner span:nth-child(2) { width:54px; height:54px; inset:76px auto auto 22px; background:var(--yellow); }
.corner span:nth-child(3) { width:22px; height:22px; inset:76px auto auto 0; }
.kicker { position:absolute; top:170px; left:110px; display:flex; align-items:center; gap:20px; padding-bottom:18px; border-bottom:3px solid var(--gold); font-weight:700; font-size:32px; letter-spacing:.14em; text-transform:uppercase; white-space:nowrap; }
.kicker__icon { width:44px; height:52px; border:3px solid var(--gold); border-radius:6px; display:flex; flex-direction:column; justify-content:center; gap:6px; padding:0 8px; position:relative; }
.kicker__icon::before { content:""; position:absolute; top:-10px; left:10px; width:22px; height:12px; border:3px solid var(--gold); border-radius:3px; background:var(--cream); }
.kicker__icon i { display:block; height:3px; background:var(--gold); }
.kicker__icon i:nth-child(1) { width:70%; }
.kicker__icon i:nth-child(2) { width:100%; }
.kicker__icon i:nth-child(3) { width:55%; }
.headline { position:absolute; top:300px; left:76px; width:690px; margin:0; font-family:"Anton",sans-serif; font-weight:400; line-height:.96; text-transform:uppercase; }
.headline__base, .headline__accent { display:block; }
.headline__accent { margin-top:14px; color:var(--gold); background:linear-gradient(100deg,#b4780a 0%,#e9a81c 45%,#f5cb4a 60%,#c8870b 100%); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
.callout { position:absolute; top:880px; left:64px; width:660px; min-height:138px; padding:26px 34px; display:flex; align-items:center; gap:24px; border-left:6px solid var(--yellow); border-radius:0 26px 26px 0; background:var(--brown); color:var(--cream); }
.callout__check { flex:0 0 62px; width:62px; height:62px; border-radius:50%; background:var(--yellow); position:relative; }
.callout__check::after { content:""; position:absolute; width:24px; height:13px; left:18px; top:18px; border-left:5px solid var(--brown); border-bottom:5px solid var(--brown); transform:rotate(-45deg); }
.callout__copy { min-width:0; display:grid; gap:5px; font-size:25px; line-height:1.2; }
.callout__copy strong { color:var(--yellow); font-size:29px; }
.callout__copy > span { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.wave { position:absolute; left:0; bottom:60px; width:1080px; height:330px; }
.brand { position:absolute; left:72px; bottom:112px; display:flex; flex-direction:column; align-items:flex-start; gap:5px; color:#dcc08c; text-transform:uppercase; }
.brand img { width:380px; height:auto; display:block; }
.brand span { padding-left:114px; font-size:17px; line-height:1.35; font-weight:600; letter-spacing:.18em; }
.tagline { position:absolute; left:0; bottom:0; width:1080px; height:60px; display:flex; align-items:center; justify-content:center; background:var(--yellow); color:var(--brown); font-size:18px; font-weight:600; letter-spacing:.2em; text-transform:uppercase; white-space:nowrap; }
`.trim();

  return {
    html,
    css,
    fonts: 'Anton&family=Montserrat:wght@400;600;700',
    height: 1430,
  };
}

// =========================================================
// LOOP PRINCIPAL
// =========================================================

const templateAtivo = escolherTemplate();

for (const item of $input.all()) {
  const dados = item.json;

  const titulo     = limparTexto(dados.titulo);
  const resumo     = limitarTexto(dados.resumo, 200);
  const textoLegenda = dados.conteudo || dados.resumo || '';
  const slug       = limparTexto(dados.slug);
  const imagemCapa = escolherImagem(dados);
  const urlNoticia = slug
    ? `https://seucasorio.com.br/noticias/${slug}`
    : 'https://seucasorio.com.br/noticias';

  // Usa a manchete da IA (titulo_card) para a capa; cai no heurístico se faltar.
  const tituloPost = gerarTituloDoCard(dados.titulo_card, titulo);
  const legenda    = montarLegendaPostUnico(titulo, textoLegenda, urlNoticia);

  let resultado;
  if      (templateAtivo === 1) resultado = gerarTemplate01(tituloPost, resumo, imagemCapa);
  else if (templateAtivo === 2) resultado = gerarTemplate02(tituloPost, resumo, imagemCapa);
  else if (templateAtivo === 3) resultado = gerarTemplate03(tituloPost, resumo, imagemCapa);
  else if (templateAtivo === 4) resultado = gerarTemplate04(tituloPost, resumo, imagemCapa);
  else if (templateAtivo === 6) resultado = gerarTemplate06(tituloPost, resumo, imagemCapa);
  else if (templateAtivo === 7) resultado = gerarTemplate07(tituloPost, resumo, imagemCapa);
  else                          resultado = gerarTemplate05(tituloPost, resumo, imagemCapa, urlNoticia);

  item.json.instagram_titulo          = titulo;
  item.json.instagram_resumo          = resumo;
  item.json.instagram_slug            = slug;
  item.json.instagram_url_noticia     = urlNoticia;
  item.json.instagram_imagem_original = imagemCapa;
  item.json.instagram_legenda         = legenda;
  item.json.instagram_template        = templateAtivo;
  item.json.instagram_force_regenerate = FORCE_REGENERATE;

  item.json.hcti_html         = resultado.html;
  item.json.hcti_css          = resultado.css;
  item.json.hcti_google_fonts = resultado.fonts;
  item.json.hcti_width        = 1080;
  item.json.hcti_height       = resultado.height || 1430;
  item.json.storyText = 'Para ler a noticia digite news na DM que enviaremos para voce';
}

return $input.all();
