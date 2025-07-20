/**
 * Addon de Sistema de Economia para Takeshi Bot.
 *
 * Este addon implementa um sistema de economia virtual com as seguintes funcionalidades:
 * - Saldo individual para cada usuário.
 * - Comando para "trabalhar" e ganhar dinheiro com cooldown.
 * - Comando para transferir dinheiro entre usuários.
 * - Loja virtual com itens para compra.
 * - Criação automática de perfil para novos usuários.
 *
 * Estrutura de dados:
 * Os dados são armazenados em um arquivo JSON local (economia.json) dentro da pasta do addon.
 * Cada usuário tem um perfil com saldo, último timestamp de trabalho e inventário.
 *
 * Comandos:
 * - /saldo: Mostra o saldo atual do usuário.
 * - /trabalhar: Ganha uma quantia de dinheiro (com cooldown).
 * - /transferir @usuário <valor>: Transfere dinheiro para outro usuário.
 * - /comprar <item>: Compra um item da loja.
 * - /comprar: Mostra os itens disponíveis na loja.
 *
 * @format
 * @author Dev Gui
 */

const fs = require('node:fs');
const path = require('node:path');

// Define o caminho para o arquivo de dados da economia.
// BASE_DIR aponta para 'src/', então '..' sobe para a raiz do bot, e então 'database/economia.json'.
const ECONOMY_DATA_FILE = path.join(BASE_DIR, '..', 'database', 'economia.json');

// Cooldown para o comando /trabalhar (30 minutos em milissegundos)
const WORK_COOLDOWN_MS = 30 * 60 * 1000;
// Valor ganho por cada trabalho
const WORK_REWARD = 10;

// Itens da loja virtual
const SHOP_ITEMS = [
  {
    id: 'espada_lendaria',
    name: 'Espada Lendária',
    price: 1000,
    description: 'Uma espada forjada por lendas.',
  },
  { id: 'pocao_cura', name: 'Poção de Cura', price: 50, description: 'Restaura sua energia.' },
  {
    id: 'armadura_divina',
    name: 'Armadura Divina',
    price: 2500,
    description: 'Proteção abençoada pelos deuses.',
  },
  {
    id: 'amuleto_sorte',
    name: 'Amuleto da Sorte',
    price: 200,
    description: 'Aumenta suas chances de sucesso.',
  },
];

/**
 * Garante que o arquivo de dados da economia exista. Se não existir, cria-o com um objeto vazio.
 */
function ensureEconomyFileExists() {
  try {
    if (!fs.existsSync(ECONOMY_DATA_FILE)) {
      // Garante que o diretório 'database' exista antes de escrever o arquivo.
      const dbDir = path.dirname(ECONOMY_DATA_FILE);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
      fs.writeFileSync(ECONOMY_DATA_FILE, JSON.stringify({}));
    }
  } catch (error) {
    console.error('[ECONOMIA-ADDON] Erro ao garantir a existência do arquivo de economia:', error);
    // Em caso de erro, encerra para evitar corrupção de dados.
    process.exit(1);
  }
}

// Chama a função para garantir que o arquivo de dados exista ao carregar o addon.
ensureEconomyFileExists();

/**
 * Lê e parseia o arquivo de dados da economia.
 * @returns {object} O objeto contendo os dados de todos os usuários.
 */
function readEconomyData() {
  try {
    const fileContent = fs.readFileSync(ECONOMY_DATA_FILE, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error('[ECONOMIA-ADDON] Erro ao ler dados da economia:', error);
    return {}; // Retorna um objeto vazio em caso de erro para evitar que o bot quebre.
  }
}

/**
 * Escreve dados no arquivo de economia de forma formatada.
 * @param {object} data - O objeto de dados da economia a ser salvo.
 */
function writeEconomyData(data) {
  try {
    fs.writeFileSync(ECONOMY_DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('[ECONOMIA-ADDON] Erro ao escrever dados da economia:', error);
  }
}

/**
 * Obtém o perfil de um usuário. Se o perfil não existir, ele é criado com valores padrão.
 * @param {string} userJid - O JID do usuário.
 * @returns {object} O perfil do usuário.
 */
function getUserProfile(userJid) {
  const data = readEconomyData();
  if (!data[userJid]) {
    data[userJid] = {
      balance: 0,
      lastWork: 0, // Timestamp da última vez que o usuário trabalhou
      inventory: [],
    };
    writeEconomyData(data);
  }
  return data[userJid];
}

/**
 * Atualiza o perfil de um usuário no arquivo de dados.
 * @param {string} userJid - O JID do usuário.
 * @param {object} profile - O perfil atualizado do usuário.
 */
function updateUserProfile(userJid, profile) {
  const data = readEconomyData();
  data[userJid] = profile;
  writeEconomyData(data);
}

/**
 * Função principal do addon, que lida com os comandos.
 * @param {object} params - Objeto de parâmetros fornecido pelo Runner.
 * @param {function} params.sendReply - Função para enviar uma resposta.
 * @param {function} params.sendSuccessReply - Função para enviar uma resposta de sucesso.
 * @param {function} params.functionName - Exemplo de como uma função permitida é passada.
 * @param {string[]} params.args - Os argumentos do comando como um array.
 * @param {string} params.fullArgs - Os argumentos do comando como uma string única.
 * @param {object} params.messageInfo - Informações de contexto da mensagem.
 */
async function handle(params) {
  // Desestrutura as funções e informações diretamente de params
  const {
    sendReply,
    sendSuccessReply,
    sendErrorReply,
    sendWarningReply,
    sendWaitReply,
    sendReact,
    sendText,
    userJid,
    remoteJid,
    isGroup,
    args,
    fullArgs,
    messageInfo,
    webMessage,
    isReply,
    replyJid,
    socket,
    getGroupParticipants,
  } = params;

  console.log(`[ECONOMIA-ADDON] Função handle invocada para o comando: ${messageInfo.commandName}`); // Log 1

  // Verifica se as funções de resposta estão definidas
  if (typeof sendReply !== 'function') {
    console.error(
      '[ECONOMIA-ADDON] Erro: sendReply não é uma função. Permissões podem estar incorretas.'
    ); // Log 2
    return; // Aborta se a função principal de resposta não estiver disponível
  }

  // Extrai o nome do comando (o primeiro argumento, que é o comando em si)
  const command = messageInfo.commandName;

  switch (command) {
    case 'saldo': {
      await sendWaitReply('Consultando seu saldo...');
      const profile = getUserProfile(userJid);
      await sendSuccessReply(`💰 Seu saldo atual é: *${profile.balance} moedas*.`);
      console.log(
        `[ECONOMIA-ADDON] Comando /saldo executado para ${userJid}. Saldo: ${profile.balance}`
      ); // Log 3
      break;
    }

    case 'trabalhar': {
      await sendWaitReply('Verificando se você pode trabalhar...');
      const profile = getUserProfile(userJid);
      const currentTime = Date.now();

      if (currentTime - profile.lastWork < WORK_COOLDOWN_MS) {
        const remainingTime = WORK_COOLDOWN_MS - (currentTime - profile.lastWork);
        const minutes = Math.ceil(remainingTime / (60 * 1000));
        await sendWarningReply(
          `Você precisa descansar um pouco! Tente novamente em *${minutes} minuto(s)*.`
        );
        console.log(`[ECONOMIA-ADDON] Comando /trabalhar em cooldown para ${userJid}.`); // Log 4
        return;
      }

      profile.balance += WORK_REWARD;
      profile.lastWork = currentTime;
      updateUserProfile(userJid, profile);
      await sendSuccessReply(
        `🎉 Você trabalhou e ganhou *${WORK_REWARD} moedas*! Seu novo saldo é: *${profile.balance} moedas*.`
      );
      console.log(
        `[ECONOMIA-ADDON] Comando /trabalhar executado para ${userJid}. Ganho: ${WORK_REWARD}. Novo saldo: ${profile.balance}`
      ); // Log 5
      break;
    }

    case 'transferir': {
      if (!fullArgs) {
        await sendWarningReply('Uso correto: /transferir @usuário <valor>');
        console.log(`[ECONOMIA-ADDON] Comando /transferir: Argumentos ausentes.`); // Log 6
        return;
      }

      const parts = fullArgs.split(' ');
      let recipientJid = null;
      let amount = 0;

      // Tenta identificar o destinatário e o valor
      if (parts.length >= 2) {
        const mentionOrNumber = parts[0];
        amount = parseInt(parts[1]);

        // Tenta resolver o JID a partir da menção ou número
        if (mentionOrNumber.startsWith('@')) {
          // Se for uma menção, tenta encontrar o JID completo
          if (isGroup) {
            const participants = await getGroupParticipants();
            const mentionedNumber = mentionOrNumber.replace('@', '');
            const foundParticipant = participants.find((p) => p.id.startsWith(mentionedNumber));
            if (foundParticipant) {
              recipientJid = foundParticipant.id;
            }
          } else {
            // Em chat privado, a menção é o próprio JID
            // No contexto de um bot, transferir para si mesmo no PV não faz sentido,
            // então pode-se adicionar uma validação ou assumir que não é permitido.
            // Por enquanto, vamos manter a lógica de tentar resolver o JID.
            // Se o bot não tem a capacidade de resolver JIDs de números arbitrários no PV,
            // esta parte pode precisar de mais lógica ou ser restrita a grupos.
            const [result] = await socket.onWhatsApp(mentionOrNumber.replace('@', ''));
            if (result && result.exists) {
              recipientJid = result.jid;
            }
          }
        } else if (!isNaN(parseInt(mentionOrNumber))) {
          // Se for um número, tenta resolver o JID
          const [result] = await socket.onWhatsApp(mentionOrNumber);
          if (result && result.exists) {
            recipientJid = result.jid;
          }
        }
      }

      if (!recipientJid || isNaN(amount) || amount <= 0) {
        await sendWarningReply(
          'Uso correto: /transferir @usuário <valor>. Certifique-se de que o usuário existe e o valor é válido.'
        );
        console.log(`[ECONOMIA-ADDON] Comando /transferir: Destinatário ou valor inválido.`); // Log 7
        return;
      }

      if (recipientJid === userJid) {
        await sendWarningReply('Você não pode transferir dinheiro para si mesmo!');
        console.log(`[ECONOMIA-ADDON] Comando /transferir: Tentativa de transferir para si mesmo.`); // Log 8
        return;
      }

      const senderProfile = getUserProfile(userJid);
      const recipientProfile = getUserProfile(recipientJid); // Cria o perfil do destinatário se não existir

      if (senderProfile.balance < amount) {
        await sendWarningReply(
          `Seu saldo (${senderProfile.balance} moedas) é insuficiente para transferir *${amount} moedas*.`
        );
        console.log(`[ECONOMIA-ADDON] Comando /transferir: Saldo insuficiente para ${userJid}.`); // Log 9
        return;
      }

      senderProfile.balance -= amount;
      recipientProfile.balance += amount;

      updateUserProfile(userJid, senderProfile);
      updateUserProfile(recipientJid, recipientProfile);

      await sendSuccessReply(
        `💸 Você transferiu *${amount} moedas* para @${
          recipientJid.split('@')[0]
        }! Seu novo saldo é: *${senderProfile.balance} moedas*.`,
        [recipientJid]
      );
      console.log(
        `[ECONOMIA-ADDON] Comando /transferir executado: ${userJid} -> ${recipientJid}, ${amount} moedas.`
      ); // Log 10
      break;
    }

    case 'comprar': {
      if (!fullArgs) {
        let shopList = '🛒 *Itens disponíveis na loja:*\n\n';
        SHOP_ITEMS.forEach((item) => {
          shopList += `*${item.name}* (${item.price} moedas)\n`;
          shopList += `_${item.description}_\n\n`;
        });
        shopList += `Para comprar, use: /comprar <nome do item>`;
        await sendReply(shopList);
        console.log(`[ECONOMIA-ADDON] Comando /comprar: Listando itens da loja.`); // Log 11
        return;
      }

      const itemName = fullArgs.toLowerCase();
      const itemToBuy = SHOP_ITEMS.find(
        (item) => item.name.toLowerCase() === itemName || item.id.toLowerCase() === itemName
      );

      if (!itemToBuy) {
        await sendWarningReply(
          `O item "${fullArgs}" não foi encontrado na loja. Verifique a grafia ou use /comprar para ver a lista.`
        );
        console.log(`[ECONOMIA-ADDON] Comando /comprar: Item '${fullArgs}' não encontrado.`); // Log 12
        return;
      }

      const profile = getUserProfile(userJid);

      if (profile.balance < itemToBuy.price) {
        await sendWarningReply(
          `Seu saldo (${profile.balance} moedas) é insuficiente para comprar *${itemToBuy.name}* (${itemToBuy.price} moedas).`
        );
        console.log(
          `[ECONOMIA-ADDON] Comando /comprar: Saldo insuficiente para comprar '${itemToBuy.name}'.`
        ); // Log 13
        return;
      }

      profile.balance -= itemToBuy.price;
      profile.inventory.push(itemToBuy.id);
      updateUserProfile(userJid, profile);

      await sendSuccessReply(
        `🎉 Você comprou *${itemToBuy.name}* por *${itemToBuy.price} moedas*! Seu novo saldo é: *${profile.balance} moedas*.`
      );
      await sendReply(`Seu inventário agora contém: ${profile.inventory.join(', ')}`);
      console.log(
        `[ECONOMIA-ADDON] Comando /comprar executado: ${userJid} comprou '${itemToBuy.name}'.`
      ); // Log 14
      break;
    }

    default:
      // Caso o comando não seja reconhecido (não deve acontecer se os comandos no manifest estão corretos)
      await sendWarningReply(
        'Comando de economia não reconhecido. Use /menu para ver os comandos disponíveis.'
      );
      console.log(`[ECONOMIA-ADDON] Comando desconhecido: ${command}.`); // Log 15
      break;
  }
}

module.exports = { handle };
