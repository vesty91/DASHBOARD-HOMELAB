ALTER TABLE `integrations` ADD `config_revision` integer DEFAULT 1 NOT NULL CONSTRAINT `integrations_config_revision_positive` CHECK (`config_revision` > 0);
