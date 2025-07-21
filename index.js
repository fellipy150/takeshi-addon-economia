const fs = require('node:fs');
const path = require('node:path');

const CD = 20 * 60 * 1000;
const RECOMP = 25;

const LOJA = [
  { id: 'pao', nome: 'Pão Francês', preco: 5, desc: 'Quentinho e crocante.' },
  { id: 'agua', nome: 'Garrafa de Água', preco: 8, desc: 'Para matar a sede.' },
  { id: 'maca', nome: 'Maçã', preco: 12, desc: 'Uma maçã por dia...' },
  { id: 'pocao', nome: 'Poção de Cura', preco: 50, desc: 'Restaura sua energia.' },
  { id: 'amuleto', nome: 'Amuleto da Sorte', preco: 200, desc: 'Aumenta suas chances de sucesso.' },
  { id: 'espada', nome: 'Espada Lendária', preco: 1000, desc: 'Uma espada forjada por lendas.' },
  {
    id: 'armadura',
    nome: 'Armadura Divina',
    preco: 2500,
    desc: 'Proteção abençoada pelos deuses.',
  },
];

let arq;

function init(p) {
  if (!arq) arq = path.join(p, 'economia.json');
  try {
    if (!fs.existsSync(arq)) fs.writeFileSync(arq, JSON.stringify({}));
  } catch (e) {
    console.error('[ECONOMIA] Erro ao criar arquivo:', e);
  }
}

function ler() {
  try {
    const dados = fs.readFileSync(arq, 'utf-8');
    return JSON.parse(dados) || {};
  } catch (e) {
    console.error('[ECONOMIA] Erro ao ler:', e);
    return {};
  }
}

function salvar(d) {
  try {
    fs.writeFileSync(arq, JSON.stringify(d, null, 2));
  } catch (e) {
    console.error('[ECONOMIA] Erro ao salvar:', e);
  }
}

function perfil(id) {
  const db = ler();
  if (!db[id]) {
    db[id] = { grana: 0, ultTrab: 0, inv: [] };
    salvar(db);
  }
  return db[id];
}

function attPerfil(id, dados) {
  const db = ler();
  db[id] = dados;
  salvar(db);
}

async function handle(ctx) {
  const {
    sendErrorReply,
    sendWaitReply,
    editMessage,
    sendSuccessReact,
    sendWarningReact,
    removeReaction,
    fullArgs,
    messageInfo,
  } = ctx;

  const id = messageInfo.userJid;

  try {
    init(messageInfo.addonPath);
    const cmd = messageInfo.commandName;
    const keyOrig = messageInfo.webMessage.key;
    const msg = await sendWaitReply(`⏳ Processando */${cmd}*...`);
    const key = msg.key;

    switch (cmd) {
      case 'saldo': {
        const p = perfil(id);
        await editMessage(key, `💰 Saldo: *R$ ${p.grana.toFixed(2)}*`);
        await sendSuccessReact(keyOrig);
        await new Promise((r) => setTimeout(r, 4000));
        await removeReaction(key);
        break;
      }

      case 'trabalhar': {
        const p = perfil(id);
        const agora = Date.now();
        const tempo = CD - (agora - p.ultTrab);

        if (tempo > 0) {
          const min = Math.ceil(tempo / 60000);
          await editMessage(key, `⏳ Descanse! Volte em *${min} min*.`);
          await sendWarningReact(keyOrig);
          return;
        }

        p.grana += RECOMP;
        p.ultTrab = agora;
        attPerfil(id, p);

        await editMessage(
          key,
          `🎉 Trabalhou e ganhou *R$ ${RECOMP.toFixed(2)}*! Saldo: *R$ ${p.grana.toFixed(2)}*`
        );
        await sendSuccessReact(keyOrig);
        break;
      }

      case 'loja':
      case 'comprar': {
        if (!fullArgs || cmd === 'loja') {
          let lista = '🛒 *Loja:*\n\n';
          LOJA.forEach((i) => {
            lista += `*${i.nome}* - R$ ${i.preco.toFixed(2)}\n_${i.desc}_\n\n`;
          });
          lista += `Use: */comprar <item>*`;
          await editMessage(key, lista);
          await sendSuccessReact(keyOrig);
          return;
        }

        const nomeItem = fullArgs.toLowerCase().trim();
        const item = LOJA.find((i) => i.nome.toLowerCase() === nomeItem || i.id === nomeItem);

        if (!item) {
          await editMessage(key, `Item "${fullArgs}" não encontrado. Use */loja*`);
          await sendWarningReact(keyOrig);
          return;
        }

        const p = perfil(id);

        if (p.grana < item.preco) {
          await editMessage(
            key,
            `Saldo insuficiente (R$ ${p.grana.toFixed(2)}). Item: *${
              item.nome
            }* custa R$ ${item.preco.toFixed(2)}.`
          );
          await sendWarningReact(keyOrig);
          return;
        }

        p.grana -= item.preco;
        p.inv = Array.isArray(p.inv) ? p.inv : [];
        p.inv.push(item.id);
        attPerfil(id, p);

        await editMessage(
          key,
          `🛍️ Comprou *${item.nome}* por *R$ ${item.preco.toFixed(
            2
          )}*. Novo saldo: *R$ ${p.grana.toFixed(2)}*.`
        );
        await sendSuccessReact(keyOrig);
        break;
      }

      case 'inventario': {
        const p = perfil(id);
        if (!p.inv || p.inv.length === 0) {
          await editMessage(key, '🎒 Inventário vazio.');
          await sendSuccessReact(keyOrig);
          return;
        }

        let txt = '🎒 *Inventário:*\n\n';
        const cont = p.inv.reduce((acc, id) => {
          acc[id] = (acc[id] || 0) + 1;
          return acc;
        }, {});

        for (const id in cont) {
          const item = LOJA.find((i) => i.id === id);
          if (item) txt += `*${item.nome}* (x${cont[id]})\n`;
        }

        await editMessage(key, txt);
        await sendSuccessReact(keyOrig);
        break;
      }

      case 'transferir': {
        console.log('[TRANSFERIR] fullArgs:', fullArgs);

        const partes = fullArgs.split(' ');
        console.log('[TRANSFERIR] partes:', partes);

        if (partes.length < 2) {
          await editMessage(key, 'Uso: */transferir @user <valor>*');
          await sendWarningReact(keyOrig);
          return;
        }

        const valorRaw = partes[1].replace(',', '.');
        const val = parseFloat(valorRaw);
        console.log('[TRANSFERIR] valor:', val);

        let dest =
          messageInfo.webMessage.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        console.log('[TRANSFERIR] dest original (mentionedJid):', dest);

        // Tenta extrair número manualmente se mentionedJid não foi detectado
        if (!dest && partes[0]) {
          const numero = partes[0].replace(/\D/g, '');
          if (numero.length >= 10) {
            dest = `${numero}@s.whatsapp.net`;
            console.log('[TRANSFERIR] dest fallback (via número direto):', dest);
          }
        }

        if (!dest) {
          await editMessage(key, 'Mencione um usuário. Uso: */transferir @user <valor>*');
          await sendWarningReact(keyOrig);
          return;
        }

        if (isNaN(val) || val <= 0) {
          await editMessage(key, 'Valor deve ser positivo.');
          await sendWarningReact(keyOrig);
          return;
        }

        if (dest === id) {
          await editMessage(key, 'Não pode transferir para si mesmo!');
          await sendWarningReact(keyOrig);
          return;
        }

        const de = perfil(id);
        console.log('[TRANSFERIR] perfil remetente:', de);

        if (de.grana < val) {
          await editMessage(
            key,
            `Saldo insuficiente: R$ ${de.grana.toFixed(2)} < R$ ${val.toFixed(2)}`
          );
          await sendWarningReact(keyOrig);
          return;
        }

        const para = perfil(dest);
        console.log('[TRANSFERIR] perfil destinatário:', para);

        de.grana -= val;
        para.grana += val;
        attPerfil(id, de);
        attPerfil(dest, para);

        console.log('[TRANSFERIR] transferência concluída');

        await editMessage(
          key,
          `💸 Transferiu *R$ ${val.toFixed(2)}* para @${
            dest.split('@')[0]
          }. Saldo atual: *R$ ${de.grana.toFixed(2)}*.`,
          [dest]
        );
        await sendSuccessReact(keyOrig);
        break;
      }

      default:
        await editMessage(key, `Comando desconhecido: ${cmd}`);
        await sendWarningReact(keyOrig);
        break;
    }
  } catch (e) {
    console.error(`Erro no addon [${messageInfo.addonName}]: ${e.message}`);
    if (sendErrorReply) await sendErrorReply('Erro interno no addon.');
  }
}

module.exports = { handle };
