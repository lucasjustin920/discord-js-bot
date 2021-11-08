const { Command } = require("@src/structures");
const { getRoleByName } = require("@utils/guildUtils");
const { Message, MessageEmbed, CommandInteraction } = require("discord.js");
const Ascii = require("ascii-table");
const { EMOJIS, EMBED_COLORS } = require("@root/config.js");
const { getSettings } = require("@schemas/Guild");

module.exports = class AutomodConfigCommand extends Command {
  constructor(client) {
    super(client, {
      name: "automodconfig",
      description: "various automod configuration",
      category: "AUTOMOD",
      userPermissions: ["MANAGE_GUILD"],
      command: {
        enabled: true,
        minArgsCount: 1,
        subcommands: [
          {
            trigger: "status",
            description: "check automod configuration for this guild",
          },
          {
            trigger: "strikes <number>",
            description: "maximum number of strikes a member can receive before taking an action",
          },
          {
            trigger: "action <MUTE|KICK|BAN>",
            description: "set action to be performed after receiving maximum strikes",
          },
          {
            trigger: "debug <ON|OFF>",
            description: "turns on automod for messages sent by admins and moderators",
          },
        ],
      },
      slashCommand: {
        enabled: true,
        ephemeral: true,
        options: [
          {
            name: "status",
            description: "Check automod configuration",
            type: "SUB_COMMAND",
          },
          {
            name: "strikes",
            description: "Set maximum number of strikes before taking an action",
            type: "SUB_COMMAND",
            options: [
              {
                name: "amount",
                description: "number of strikes (default 5)",
                required: true,
                type: "INTEGER",
              },
            ],
          },
          {
            name: "action",
            description: "Set action to be performed after receiving maximum strikes",
            type: "SUB_COMMAND",
            options: [
              {
                name: "action",
                description: "action to perform",
                type: "STRING",
                required: true,
                choices: [
                  {
                    name: "MUTE",
                    value: "MUTE",
                  },
                  {
                    name: "KICK",
                    value: "KICK",
                  },
                  {
                    name: "BAN",
                    value: "BAN",
                  },
                ],
              },
            ],
          },
          {
            name: "debug",
            description: "Enable/disable automod for messages sent by admins & moderators",
            type: "SUB_COMMAND",
            options: [
              {
                name: "status",
                description: "configuration status",
                required: true,
                type: "STRING",
                choices: [
                  {
                    name: "ON",
                    value: "ON",
                  },
                  {
                    name: "OFF",
                    value: "OFF",
                  },
                ],
              },
            ],
          },
        ],
      },
    });
  }

  /**
   * @param {Message} message
   * @param {string[]} args
   */
  async messageRun(message, args) {
    const input = args[0].toLowerCase();
    const settings = await getSettings(message.guild);

    let response;
    if (input === "status") {
      response = await getStatus(settings, message.guild);
    }

    if (input === "strikes") {
      const strikes = args[1];
      if (isNaN(strikes) || Number.parseInt(strikes) < 1) {
        return message.reply("Strikes must be a valid number greater than 0");
      }
      response = await setStrikes(settings, strikes);
    }

    if (input === "action") {
      const action = args[1].toUpperCase();
      if (!action || !["MUTE", "KICK", "BAN"].includes(action))
        return message.reply("Not a valid action. Action can be `Mute`/`Kick`/`Ban`");
      response = await setAction(settings, message.guild, action);
    }

    if (input === "debug") {
      const status = args[1].toLowerCase();
      if (!["on", "off"].includes(status)) return message.reply("Invalid status. Value must be `on/off`");
      response = await setDebug(settings, status);
    }

    await message.reply(response);
  }

  /**
   * @param {CommandInteraction} interaction
   */
  async interactionRun(interaction) {
    const sub = interaction.options.getSubcommand();
    const settings = await getSettings(interaction.guild);

    let response;

    // status
    if (sub === "status") response = await getStatus(settings, interaction.guild);
    else if (sub === "strikes") response = await setStrikes(settings, interaction.options.getInteger("amount"));
    else if (sub === "action")
      response = await setAction(settings, interaction.guild, interaction.options.getString("action"));
    else if (sub === "debug") response = await setDebug(settings, interaction.options.getString("status"));

    interaction.reply(response);
  }
};

async function getStatus(settings, guild) {
  const { automod } = settings;

  const table = new Ascii("").setHeading("Feature", "Status");
  const logChannel = settings.modlog_channel
    ? guild.channels.cache.get(settings.modlog_channel).toString()
    : "Not Configured";

  table
    .addRow("Max Lines", automod.max_lines || "NA")
    .addRow("Max Mentions", automod.max_mentions || "NA")
    .addRow("Max Role Mentions", automod.max_role_mentions || "NA")
    .addRow("AntiLinks", automod.anti_links ? EMOJIS.TICK : EMOJIS.X_MARK)
    .addRow("AntiScam", automod.anti_scam ? EMOJIS.TICK : EMOJIS.X_MARK)
    .addRow("AntiInvites", automod.anti_invites ? EMOJIS.TICK : EMOJIS.X_MARK)
    .addRow("AntiGhostPing", automod.anti_ghostping ? EMOJIS.TICK : EMOJIS.X_MARK);

  const embed = new MessageEmbed()
    .setAuthor("Automod Configuration")
    .setColor(EMBED_COLORS.TRANSPARENT_EMBED)
    .setDescription("```" + table.toString() + "```");

  return { content: `**Log Channel:** ${logChannel}`, embeds: [embed] };
}

async function setStrikes(settings, strikes) {
  settings.automod.strikes = strikes;
  await settings.save();
  return `Configuration saved! Maximum strikes is set to ${strikes}`;
}

async function setAction(settings, guild, action) {
  if (action === "MUTE") {
    let mutedRole = getRoleByName(guild, "muted");
    if (!mutedRole) {
      return `Muted role doesn't exist in this guild`;
    }

    if (!mutedRole.editable) {
      return "I do not have permission to move members to `Muted` role. Is that role below my highest role?";
    }
  }

  if (action === "KICK") {
    if (!guild.me.permissions.has("KICK_MEMBERS")) {
      return "I do not have permission to kick members";
    }
  }

  if (action === "BAN") {
    if (!guild.me.permissions.has("BAN_MEMBERS")) {
      return "I do not have permission to ban members";
    }
  }

  settings.automod.action = action;
  await settings.save();
  return `Configuration saved! Automod action is set to ${action}`;
}

async function setDebug(settings, input) {
  const status = input.toLowerCase() === "on" ? true : false;
  settings.automod.debug = status;
  await settings.save();
  return `Configuration saved! Automod debug is now ${status ? "enabled" : "disabled"}`;
}
