require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const cron = require('node-cron');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

// Конфигурация из переменных окружения
const CHANNEL_ID = process.env.CHANNEL_ID;
const PREFIX = '!'; // Префикс для команд

// Хранилище последних сообщений для защиты от спама
const recentMessages = new Map();
const MESSAGE_RATE_LIMIT = 3; // Максимальное количество сообщений
const TIME_WINDOW = 10000; // 10 секунд в миллисекундах

client.once('ready', () => {
  console.log(`Бот ${client.user.tag} готов к работе!`);

  // Настраиваем расписание для уведомления о дропе в 4 времени
  const dropTimes = ['35 0 * * *', '35 6 * * *', '35 12 * * *', '35 18 * * *'];
  
  dropTimes.forEach((timePattern, index) => {
    cron.schedule(timePattern, () => {
      const channel = client.channels.cache.get(CHANNEL_ID);
      
      if (!channel) {
        console.error('Канал не найден!');
        return;
      }

      channel.send('Через 5 минут будет дроп! @players')
        .then(() => console.log(`Уведомление о дропе отправлено успешно (${index + 1}/4)`))
        .catch(console.error);
    }, {
      timezone: 'Europe/Moscow' // Укажите вашу временную зону
    });
  });

  // Настраиваем расписание для очистки старых сообщений бота
  cron.schedule('0 0 * * *', async () => {
    const channel = client.channels.cache.get(CHANNEL_ID);
    
    if (!channel) {
      console.error('Канал не найден!');
      return;
    }

    try {
      // Получаем сообщения (ограничение 100)
      const messages = await channel.messages.fetch({ limit: 100 });
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000; // 1 день в миллисекундах

      // Фильтруем сообщения бота старше 1 дня
      const messagesToDelete = messages.filter(msg => {
        return msg.author.id === client.user.id && (now - msg.createdTimestamp) > oneDay;
      });

      // Удаляем сообщения
      if (messagesToDelete.size > 0) {
        // Используем цикл для удаления каждого сообщения по отдельности
        for (const [id, message] of messagesToDelete) {
          await message.delete().catch(console.error);
        }
        console.log(`Удалено ${messagesToDelete.size} сообщений бота старше 1 дня`);
      }
    } catch (error) {
      console.error('Ошибка при очистке сообщений:', error);
    }
  }, {
    timezone: 'Europe/Moscow'
  });
});

// Обработка команд
client.on('messageCreate', async (message) => {
  // Игнорируем сообщения от ботов
  if (message.author.bot) return;
  
  // Проверяем, начинается ли сообщение с префикса команды
  if (!message.content.startsWith(PREFIX)) {
    // Если это не команда, применяем защиту от спама только в целевом канале
    if (message.channel.id === CHANNEL_ID) {
      applySpamProtection(message);
    }
    return;
  }

  // Разбираем команду
  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // Обрабатываем команду ping
  if (command === 'ping') {
    const sent = await message.reply('Проверка...');
    const ping = sent.createdTimestamp - message.createdTimestamp;
    
    sent.edit(`Pong! Задержка: ${ping}мс\n📶 Задержка API: ${Math.round(client.ws.ping)}мс`);
  }
});

// Функция защиты от спама
async function applySpamProtection(message) {
  const userId = message.author.id;
  const now = Date.now();

  // Проверяем, есть ли пользователь в нашем хранилище
  if (!recentMessages.has(userId)) {
    recentMessages.set(userId, []);
  }

  // Добавляем новое сообщение
  const userMessages = recentMessages.get(userId);
  userMessages.push(now);

  // Фильтруем сообщения, которые находятся в пределах временного окна
  const recentUserMessages = userMessages.filter(time => now - time < TIME_WINDOW);

  // Обновляем хранилище
  recentMessages.set(userId, recentUserMessages);

  // Если превышен лимит сообщений - просто удаляем без предупреждения
  if (recentUserMessages.length > MESSAGE_RATE_LIMIT) {
    await message.delete().catch(console.error);
  }
}

// Очистка хранилища сообщений каждые 5 минут
setInterval(() => {
  const now = Date.now();
  for (const [userId, messages] of recentMessages.entries()) {
    const updatedMessages = messages.filter(time => now - time < TIME_WINDOW);
    if (updatedMessages.length === 0) {
      recentMessages.delete(userId);
    } else {
      recentMessages.set(userId, updatedMessages);
    }
  }
}, 300000); // 5 минут

client.login(process.env.DISCORD_TOKEN);