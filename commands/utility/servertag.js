const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Tag එක save කරගන්න file එකේ path එක
const tagFilePath = path.join(__dirname, '../../serverTags.json');

// Helper: Rate limit වළක්වන්න පොඩි delay එකක්
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// JSON file එක read කරන function එක
function getTags() {
    try {
        if (!fs.existsSync(tagFilePath)) {
            fs.writeFileSync(tagFilePath, JSON.stringify({}, null, 2));
        }
        const rawData = fs.readFileSync(tagFilePath, 'utf8');
        return JSON.parse(rawData || '{}');
    } catch (error) {
        console.error('serverTags.json කියවීමේ දෝෂයක්:', error);
        return {};
    }
}

// JSON file එක save කරන function එක
function saveTags(data) {
    try {
        fs.writeFileSync(tagFilePath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('serverTags.json save කිරීමේ දෝෂයක්:', error);
    }
}

// පරණ Tag එකක් තිබුණොත් ඒක අයින් කරලා පිරිසිදු නම ගන්න function එක
function cleanOldTag(currentName, oldTag) {
    if (!oldTag || !currentName) return currentName;
    const prefix = `${oldTag} | `;
    if (currentName.startsWith(prefix)) {
        return currentName.slice(prefix.length).trim();
    }
    return currentName;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('servertag')
        .setDescription('Server එකේ සියලු දෙනාගේම නමට Tag එකක් දාන්න, ඉවත් කරන්න හෝ පරීක්ෂා කරන්න')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Server එකේ හැමෝගෙම නමට Tag එකක් එකතු කරන්න')
                .addStringOption(option =>
                    option.setName('tagname')
                        .setDescription('දාන්න ඕන Tag එක (උදා: SL)')
                        .setRequired(true)
                        .setMaxLength(12)
                        .setMinLength(1)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Server එකේ සියලු දෙනාගේම Tag ඉවත් කර පෙර තිබූ නමට සකස් කරන්න'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('දැනට Server එකට යොදා ඇති Tag එක පරීක්ෂා කරන්න')),

    async execute(interaction) {
        await interaction.deferReply();

        const subcommand = interaction.options.getSubcommand();
        const guild = interaction.guild;
        const tags = getTags();
        const currentSavedTag = tags[guild.id] || null;

        if (!guild) {
            return interaction.editReply('❌ මෙම command එක Server එකක් තුළ පමණක් භාවිතා කළ හැක.');
        }

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageNicknames)) {
            return interaction.editReply('❌ ඔබට **Manage Nicknames** permission එක නැත!');
        }

        if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageNicknames)) {
            return interaction.editReply('❌ මට **Manage Nicknames** permission එක නැත! කරුණාකර Bot ගේ Role එකට එම permission එක ලබා දෙන්න.');
        }

        // --- STATUS SUBCOMMAND ---
        if (subcommand === 'status') {
            const embed = new EmbedBuilder()
                .setColor(currentSavedTag ? '#00FF7F' : '#FF5555')
                .setTitle('🏷️ Server Tag තත්ත්වය')
                .setDescription(
                    currentSavedTag
                        ? `✅ දැනට ක්‍රියාත්මක Tag එක: **\`${currentSavedTag} |\`**\n*(අලුතින් සම්බන්ධ වන සාමාජිකයින්ටද මෙය ස්වයංක්‍රීයව යෙදේ)*`
                        : 'ℹ️ දැනට මෙම Server එක සඳහා කිසිදු Tag එකක් යොදා නොමැත.'
                )
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        let members = guild.members.cache;
        if (members.size < guild.memberCount) {
            try {
                members = await guild.members.fetch();
            } catch (err) {
                console.log('Members fetch rate limit විය, cache එක භාවිතා කරයි:', err.message);
                members = guild.members.cache;
            }
        }

        if (guild.members.me && !members.has(guild.members.me.id)) {
            members.set(guild.members.me.id, guild.members.me);
        }

        // --- SET SUBCOMMAND ---
        if (subcommand === 'set') {
            let rawTag =
                interaction.options.getString('tagname') ??
                interaction.options.get('tagname')?.value ??
                interaction.options.data[0]?.options?.[0]?.value ??
                null;

            if (typeof rawTag !== 'string' || !rawTag.trim()) {
                return interaction.editReply('❌ Tag එක ලබා ගැනීමට නොහැකි විය! කරුණාකර Bot ගේ Slash Commands නැවත **Deploy** කර Discord restart කර උත්සාහ කරන්න.');
            }

            const tagName = rawTag.replace(/\|/g, '').trim();

            if (!tagName) {
                return interaction.editReply('❌ කරුණාකර වලංගු Tag එකක් ඇතුළත් කරන්න.');
            }

            tags[guild.id] = tagName;
            saveTags(tags);

            let count = 0;
            let skipped = 0;
            let processed = 0;
            const totalMembers = members.size;

            await interaction.editReply(`⏳ සාමාජිකයින් **${totalMembers}** දෙනෙකු (Bot ඇතුළුව) සඳහා **\`${tagName} |\`** යොදමින් පවතී...`);

            for (const [id, member] of members) {
                processed++;

                if (member.id === guild.ownerId) {
                    skipped++;
                    continue;
                }

                const isBotSelf = member.id === guild.members.me?.id;
                const currentDisplay = member.nickname || member.user.globalName || member.user.username;
                const cleanBaseName = cleanOldTag(currentDisplay, currentSavedTag);
                const newNickname = `${tagName} | ${cleanBaseName}`.slice(0, 32);

                if (member.nickname === newNickname) continue;

                if (isBotSelf) {
                    try {
                        await guild.members.editMe({ nick: newNickname });
                        count++;
                        if (totalMembers > 15) await sleep(350);
                    } catch (err) {
                        skipped++;
                        console.log('Bot ගේ nickname එක වෙනස් කිරීමට නොහැකි විය:', err.message);
                    }
                } else if (member.manageable) {
                    try {
                        await member.setNickname(newNickname);
                        count++;
                        if (totalMembers > 15) await sleep(350);
                    } catch (err) {
                        skipped++;
                        console.log(`${member.user.tag} ගේ නම වෙනස් කිරීමට නොහැකි විය:`, err.message);
                    }
                } else {
                    skipped++;
                }

                if (processed % 25 === 0) {
                    await interaction.editReply(`⏳ සකසමින් පවතී... (**${processed}/${totalMembers}** පරීක්ෂා කර ඇත)`).catch(() => {});
                }
            }

            const embed = new EmbedBuilder()
                .setColor('#00FF7F')
                .setTitle('✅ Server Tag සාර්ථකව යෙදුවා!')
                .addFields(
                    { name: '🏷️ යෙදූ Tag එක', value: `\`${tagName} | Name\``, inline: true },
                    { name: '👥 යාවත්කාලීන වූ ගණන', value: `**${count}** දෙනෙකි`, inline: true },
                    { name: '⚠️ මඟහැරුණු ගණන', value: `**${skipped}** දෙනෙකි *(Owner / High Roles)*`, inline: true }
                )
                .setFooter({ text: 'Bot ඇතුළු සියලුම manageable සාමාජිකයින්ට Tag එක යොදා ඇත.' });

            await interaction.editReply({ content: null, embeds: [embed] });

        // --- CLEAR SUBCOMMAND ---
        } else if (subcommand === 'clear') {
            if (tags[guild.id]) {
                delete tags[guild.id];
                saveTags(tags);
            }

            let count = 0;
            let skippedHighRoles = 0;
            let processed = 0;
            const totalMembers = members.size;

            await interaction.editReply(`⏳ සාමාජිකයින් **${totalMembers}** දෙනෙකුගේ (Bot ඇතුළුව) Tag ඉවත් කරමින් පවතී...`);

            for (const [id, member] of members) {
                processed++;
                if (member.id === guild.ownerId) continue;

                const isBotSelf = member.id === guild.members.me?.id;

                // Bot සඳහා `member.nickname` null වුණත් `displayName` එකේ tag එක තියෙන්න පුළුවන්
                const effectiveNick = member.nickname || (isBotSelf ? member.displayName : null);
                if (!effectiveNick) continue;

                if (isBotSelf) {
                    try {
                        let restoredName = null;
                        if (currentSavedTag && effectiveNick.startsWith(`${currentSavedTag} | `)) {
                            const stripped = cleanOldTag(effectiveNick, currentSavedTag);
                            restoredName = stripped && stripped !== member.user.username ? stripped : null;
                        }
                        await guild.members.editMe({ nick: restoredName });
                        count++;
                        if (totalMembers > 15) await sleep(350);
                    } catch (err) {
                        console.log('Bot ගේ nickname එක reset කිරීමට නොහැකි විය:', err.message);
                    }
                } else if (member.manageable) {
                    try {
                        let restoredName = null;
                        if (currentSavedTag && member.nickname?.startsWith(`${currentSavedTag} | `)) {
                            const stripped = cleanOldTag(member.nickname, currentSavedTag);
                            const originalDefault = member.user.globalName || member.user.username;
                            restoredName = (stripped !== originalDefault && stripped.length > 0) ? stripped : null;
                        }

                        await member.setNickname(restoredName);
                        count++;
                        if (totalMembers > 15) await sleep(350);
                    } catch (err) {
                        console.log(`${member.user.tag} ගේ නම reset කිරීමට නොහැකි විය:`, err.message);
                    }
                } else {
                    skippedHighRoles++;
                }

                if (processed % 25 === 0) {
                    await interaction.editReply(`⏳ ඉවත් කරමින් පවතී... (**${processed}/${totalMembers}** පරීක්ෂා කර ඇත)`).catch(() => {});
                }
            }

            let description = `🧹 සාමාජිකයින් **${count}** දෙනෙකුගේ (Bot ඇතුළුව) Tag ඉවත් කර පෙර තිබූ නම් වලට සකස් කළා!`;
            if (skippedHighRoles > 0) {
                description += `\n\n⚠️ **සටහන:** Bot ගේ Role එකට වඩා ඉහළ Roles ඇති **${skippedHighRoles}** දෙනෙකුගේ නම් වෙනස් කිරීමට නොහැකි විය. *(Server Settings > Roles වලින් Bot ගේ Role එක ඉහළටම දමන්න)*`;
            }

            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('🧹 Server Tags ඉවත් කරන ලදී')
                .setDescription(description);

            await interaction.editReply({ content: null, embeds: [embed] });
        }
    },
};
