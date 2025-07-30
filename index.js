/**
 * Addon de Sistema de Economia para Takeshi Bot (v1.3.0)
 *
 * Adaptado para o novo template de addons, com as seguintes melhorias:
 * - Uso da bridge para acessar módulos nativos (fs, path) de forma segura.
 * - Estrutura de permissões atualizada no addon.json.
 * - Lógica de comandos centralizada na função `handle`.
 * - Remoção de dependências e parâmetros desnecessários.
 *
 * @format
 * @author Paulo
 * @version 1.3.0
 */

// --- Configurações da Economia ---
const WORK_COOLDOWN_MS = 20 * 60 * 1000; // 20 minutos
const WORK_REWARD = 25;
const SHOP_ITEMS = [
  { id: 'pao', name: 'Pão Francês', price: 5, description: 'Quentinho e crocante.' },
  { id: 'agua', name: 'Garrafa de Água', price: 8, description: 'Para matar a sede.' },
  { id: 'maca', name: 'Maçã', price: 12, description: 'Uma maçã por dia...' },
  { id: 'pocao_cura', name: 'Poção de Cura', price: 50, description: 'Restaura sua energia.' },
  {
    id: 'amuleto_sorte',
    name: 'Amuleto da Sorte',
    price: 200,
    description: 'Aumenta suas chances de sucesso.',
  },
  {
    id: 'espada_lendaria',
    name: 'Espada Lendária',
    price: 1000,
    description: 'Uma espada forjada por lendas.',
  },
  {
    id: 'armadura_divina',
    name: 'Armadura Divina',
    price: 2500,
    description: 'Proteção abençoada pelos deuses.',
  },
];

// --- Funções de Gerenciamento de Dados ---

let fs, path, economyDataFile;

/**
 * Inicializa os módulos e o caminho do arquivo de dados.
 * @param {object} bridge - A ponte de funções seguras.
 * @param {string} addonPath - O caminho para a pasta do addon.
 */
function initialize(bridge, addonPath) {
  if (!fs) {
    fs = bridge.require('fs');
    path = bridge.require('path');
    economyDataFile = path.join(addonPath, 'economia.json');
  }
}

/**
 * Garante que o arquivo de dados da economia exista.
 */
function ensureEconomyFileExists() {
  try {
    if (!fs.existsSync(economyDataFile)) {
      fs.writeFileSync(economyDataFile, JSON.stringify({}));
    }
  } catch (error) {
    console.error('[ECONOMIA-ADDON] Erro ao criar arquivo de economia:', error);
  }
}

/**
 * Lê e parseia o arquivo de dados da economia.
 * @returns {object} O objeto contendo os dados de todos os usuários.
 */
function readEconomyData() {
  try {
    const fileContent = fs.readFileSync(economyDataFile, 'utf-8');
    return JSON.parse(fileContent || '{}');
  } catch (error) {
    console.error('[ECONOMIA-ADDON] Erro ao ler dados da economia:', error);
    return {};
  }
}

/**
 * Escreve dados no arquivo de economia.
 * @param {object} data - O objeto de dados da economia a ser salvo.
 */
function writeEconomyData(data) {
  try {
    fs.writeFileSync(economyDataFile, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('[ECONOMIA-ADDON] Erro ao escrever dados da economia:', error);
  }
}

/**
 * Obtém ou cria o perfil de um usuário.
 * @param {string} userJid - O JID do usuário.
 * @returns {object} O perfil do usuário.
 */
function getUserProfile(userJid) {
  const data = readEconomyData();
  if (!data[userJid]) {
    data[userJid] = {
      balance: 0,
      lastWork: 0,
      inventory: [],
    };
    writeEconomyData(data);
  }
  return data[userJid];
}

/**
 * Atualiza o perfil de um usuário.
 * @param {string} userJid - O JID do usuário.
 * @param {object} profile - O perfil atualizado do usuário.
 */
function updateUserProfile(userJid, profile) {
  const data = readEconomyData();
  data[userJid] = profile;
  writeEconomyData(data);
}

/**
 * Função principal para comandos.
 * @param {object} params - O objeto de parâmetros fornecido pelo Runner.
 */
async function handle(params) {
  const {
    sendErrorReply,
    sendWaitReply,
    editMessage,
    sendSuccessReact,
    sendWarningReact,
    removeReaction,
    fullArgs,
    messageInfo,
    bridge, // Acesso à bridge para usar 'require'
  } = params;

  const userJid = messageInfo.userJid;

  try {
    // Inicializa os módulos 'fs' e 'path' de forma segura através da bridge
    initialize(bridge, messageInfo.addonPath);
    ensureEconomyFileExists();

    const command = messageInfo.commandName;
    const originalMessageKey = messageInfo.webMessage.key;

    const sentMessage = await sendWaitReply(`⏳ Processando comando */${command}*...`);
    const sentMessageKey = sentMessage.key;

    switch (command) {
      case 'saldo': {
        const profile = getUserProfile(userJid);
        await editMessage(
          sentMessageKey,
          `💰 Seu saldo atual é: *R$ ${profile.balance.toFixed(2)}*.`
        );
        await sendSuccessReact(originalMessageKey);
        await new Promise((resolve) => setTimeout(resolve, 4000));
        await removeReaction(sentMessageKey);
        break;
      }

      case 'trabalhar': {
        const profile = getUserProfile(userJid);
        const currentTime = Date.now();
        const remainingTime = WORK_COOLDOWN_MS - (currentTime - profile.lastWork);

        if (remainingTime > 0) {
          const minutes = Math.ceil(remainingTime / 60000);
          await editMessage(
            sentMessageKey,
            `Você precisa descansar! Tente novamente em *${minutes} minuto(s)*.`
          );
          await sendWarningReact(originalMessageKey);
          return;
        }

        profile.balance += WORK_REWARD;
        profile.lastWork = currentTime;
        updateUserProfile(userJid, profile);

        await editMessage(
          sentMessageKey,
          `🎉 Você trabalhou e ganhou *R$ ${WORK_REWARD.toFixed(
            2
          )}*! Seu novo saldo é: *R$ ${profile.balance.toFixed(2)}*.`
        );
        await sendSuccessReact(originalMessageKey);
        break;
      }

      case 'loja':
      case 'comprar': {
        if (!fullArgs || command === 'loja') {
          let shopList = '🛒 *Itens disponíveis na loja:*\n\n';
          SHOP_ITEMS.forEach((item) => {
            shopList += `*${item.name}* - R$ ${item.price.toFixed(2)}\n`;
            shopList += `_${item.description}_\n\n`;
          });
          shopList += `Para comprar, use: */comprar <nome do item>*`;
          await editMessage(sentMessageKey, shopList);
          await sendSuccessReact(originalMessageKey);
          return;
        }

        const itemName = fullArgs.toLowerCase().trim();
        const itemToBuy = SHOP_ITEMS.find(
          (item) => item.name.toLowerCase() === itemName || item.id.toLowerCase() === itemName
        );

        if (!itemToBuy) {
          await editMessage(
            sentMessageKey,
            `O item "${fullArgs}" não foi encontrado na loja. Use */loja* para ver a lista.`
          );
          await sendWarningReact(originalMessageKey);
          return;
        }

        const profile = getUserProfile(userJid);

        if (profile.balance < itemToBuy.price) {
          await editMessage(
            sentMessageKey,
            `Seu saldo (R$ ${profile.balance.toFixed(2)}) é insuficiente para comprar *${
              itemToBuy.name
            }* (R$ ${itemToBuy.price.toFixed(2)}).`
          );
          await sendWarningReact(originalMessageKey);
          return;
        }

        profile.balance -= itemToBuy.price;
        if (!Array.isArray(profile.inventory)) {
          profile.inventory = [];
        }
        profile.inventory.push(itemToBuy.id);
        updateUserProfile(userJid, profile);

        await editMessage(
          sentMessageKey,
          `🛍️ Você comprou *${itemToBuy.name}* por *R$ ${itemToBuy.price.toFixed(
            2
          )}*! Seu novo saldo é: *R$ ${profile.balance.toFixed(2)}*.`
        );
        await sendSuccessReact(originalMessageKey);
        break;
      }

      case 'inventario': {
        const profile = getUserProfile(userJid);
        if (!profile.inventory || profile.inventory.length === 0) {
          await editMessage(sentMessageKey, '🎒 Seu inventário está vazio.');
          await sendSuccessReact(originalMessageKey);
          return;
        }

        let inventoryList = '🎒 *Seu inventário:*\n\n';
        const itemCounts = profile.inventory.reduce((acc, id) => {
          acc[id] = (acc[id] || 0) + 1;
          return acc;
        }, {});

        for (const id in itemCounts) {
          const item = SHOP_ITEMS.find((i) => i.id === id);
          if (item) {
            inventoryList += `*${item.name}* (x${itemCounts[id]})\n`;
          }
        }

        await editMessage(sentMessageKey, inventoryList);
        await sendSuccessReact(originalMessageKey);
        break;
      }

      case 'transferir': {
        const parts = fullArgs.split(' ');
        if (parts.length < 2) {
          await editMessage(sentMessageKey, 'Uso correto: */transferir @usuário <valor>*');
          await sendWarningReact(originalMessageKey);
          return;
        }

        const amount = parseInt(parts[1]);
        const recipientJid =
          messageInfo.webMessage.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

        if (!recipientJid) {
          await editMessage(sentMessageKey, 'Você precisa mencionar um usuário para transferir.');
          await sendWarningReact(originalMessageKey);
          return;
        }

        if (isNaN(amount) || amount <= 0) {
          await editMessage(
            sentMessageKey,
            'O valor da transferência deve ser um número positivo.'
          );
          await sendWarningReact(originalMessageKey);
          return;
        }

        if (recipientJid === userJid) {
          await editMessage(sentMessageKey, 'Você não pode transferir dinheiro para si mesmo!');
          await sendWarningReact(originalMessageKey);
          return;
        }

        const senderProfile = getUserProfile(userJid);
        if (senderProfile.balance < amount) {
          await editMessage(
            sentMessageKey,
            `Seu saldo (R$ ${senderProfile.balance.toFixed(
              2
            )}) é insuficiente para transferir *R$ ${amount.toFixed(2)}*.`
          );
          await sendWarningReact(originalMessageKey);
          return;
        }

        const recipientProfile = getUserProfile(recipientJid);
        senderProfile.balance -= amount;
        recipientProfile.balance += amount;
        updateUserProfile(userJid, senderProfile);
        updateUserProfile(recipientJid, recipientProfile);

        await editMessage(
          sentMessageKey,
          `💸 Você transferiu *R$ ${amount.toFixed(2)}* para @${
            recipientJid.split('@')[0]
          }! Seu novo saldo é: *R$ ${senderProfile.balance.toFixed(2)}*.`,
          [recipientJid]
        );
        await sendSuccessReact(originalMessageKey);
        break;
      }

      default:
        await editMessage(sentMessageKey, `Comando de economia não reconhecido: ${command}.`);
        await sendWarningReact(originalMessageKey);
        break;
    }
  } catch (error) {
    console.error(`Erro no handle do addon [${messageInfo.addonName}]:`, error);
    if (sendErrorReply) {
      await sendErrorReply('Ocorreu um problema interno ao executar este comando.');
    }
  }
}

// Como este addon não usa gatilhos, exportamos apenas a função `handle`.
module.exports = {
  handle,
};
