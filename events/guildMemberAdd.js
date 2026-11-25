const fs = require('fs');
const path = require('path');

// serverTags.json එක main folder එකේ තියෙනවා නම් '../serverTags.json' දෙන්න
const tagFilePath = path.join(__dirname, '../serverTags.json');

module.exports = {
    name: 'guildMemberAdd', // සමහර bots වල Events.GuildMemberAdd කියලත් තියෙනවා
    async execute(member) {
        // Bot කෙනෙක් නම් ignore කරන්න
        if (member.user.bot) return;

        if (fs.existsSync(tagFilePath)) {
            const tags = JSON.parse(fs.readFileSync(tagFilePath, 'utf8'));
            const tagName = tags[member.guild.id];

            // Server එකට tag එකක් set කරලා තියෙනවා නම්
            if (tagName) {
                const newNickname = `${tagName} ${member.displayName}`.slice(0, 32);

                try {
                    if (member.manageable) {
                        await member.setNickname(newNickname);
                    }
                } catch (err) {
                    console.log(`අලුත් member (${member.user.tag}) ගේ නම වෙනස් කිරීමට නොහැකි විය:`, err);
                }
            }
        }
    },
};
