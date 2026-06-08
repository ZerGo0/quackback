FROM postgres:18

# Install pg_cron and pgvector extensions
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    postgresql-18-cron \
    postgresql-18-pgvector \
    && rm -rf /var/lib/apt/lists/*

# Configure pg_cron for the default Quackback database. docker-compose.prod.yml
# still overrides cron.database_name when POSTGRES_DB is customized.
RUN { \
    echo "shared_preload_libraries = 'pg_cron'"; \
    echo "cron.database_name = 'quackback'"; \
  } >> /usr/share/postgresql/postgresql.conf.sample

COPY init-pgcron.sql /docker-entrypoint-initdb.d/init-pgcron.sql
