-- Create UserSubChat table
CREATE TABLE IF NOT EXISTS user_subchats (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES user_chat_sessions(id) ON DELETE CASCADE,
    task_id INTEGER REFERENCES user_tasks(id) ON DELETE SET NULL,
    version INTEGER DEFAULT 1,
    tokens_used INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Alter user_chat_sessions to remove old columns and keep only essential
ALTER TABLE user_chat_sessions DROP COLUMN IF EXISTS context_type;
ALTER TABLE user_chat_sessions DROP COLUMN IF EXISTS context_id;
ALTER TABLE user_chat_sessions ADD CONSTRAINT uq_user_chat_sessions_user_id UNIQUE (user_id) ON CONFLICT DO NOTHING;

-- Alter user_chat_messages to reference user_subchats instead of user_chat_sessions
ALTER TABLE user_chat_messages DROP CONSTRAINT IF EXISTS user_chat_messages_session_id_fkey;
ALTER TABLE user_chat_messages ADD COLUMN IF NOT EXISTS subchat_id INTEGER;
ALTER TABLE user_chat_messages ADD COLUMN IF NOT EXISTS tokens INTEGER DEFAULT 0;

-- Migrate existing messages to new structure (if any)
DO $$
DECLARE
    old_session_id INTEGER;
    new_subchat_id INTEGER;
BEGIN
    FOR old_session_id IN SELECT DISTINCT session_id FROM user_chat_messages WHERE subchat_id IS NULL LOOP
        -- Create a subchat for each old session
        INSERT INTO user_subchats (session_id, task_id, version, tokens_used, created_at, updated_at)
        SELECT old_session_id, NULL, 1, 0, NOW(), NOW()
        WHERE NOT EXISTS (
            SELECT 1 FROM user_subchats WHERE session_id = old_session_id AND task_id IS NULL
        )
        RETURNING id INTO new_subchat_id;

        -- If no new subchat was created, get the existing one
        IF new_subchat_id IS NULL THEN
            SELECT id INTO new_subchat_id FROM user_subchats WHERE session_id = old_session_id AND task_id IS NULL LIMIT 1;
        END IF;

        -- Update messages to point to the new subchat
        UPDATE user_chat_messages
        SET subchat_id = new_subchat_id
        WHERE session_id = old_session_id AND subchat_id IS NULL;
    END LOOP;
END $$;

-- Now make subchat_id NOT NULL
ALTER TABLE user_chat_messages DROP COLUMN session_id;
ALTER TABLE user_chat_messages ALTER COLUMN subchat_id SET NOT NULL;
ALTER TABLE user_chat_messages ADD CONSTRAINT user_chat_messages_subchat_id_fkey
    FOREIGN KEY (subchat_id) REFERENCES user_subchats(id) ON DELETE CASCADE;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_subchats_session_id ON user_subchats(session_id);
CREATE INDEX IF NOT EXISTS idx_user_subchats_task_id ON user_subchats(task_id);
CREATE INDEX IF NOT EXISTS idx_user_chat_messages_subchat_id ON user_chat_messages(subchat_id);
