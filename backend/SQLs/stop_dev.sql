-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.compra_item (
  compra_item_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  jogador_id bigint NOT NULL,
  item_id bigint NOT NULL,
  preco bigint NOT NULL,
  qtde bigint NOT NULL,
  data_hora_compra timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  CONSTRAINT compra_item_pkey PRIMARY KEY (compra_item_id),
  CONSTRAINT compra_item_jogador_id_fkey FOREIGN KEY (jogador_id) REFERENCES public.jogador(jogador_id),
  CONSTRAINT compra_item_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.item(item_id)
);
CREATE TABLE public.compra_pacote (
  compra_pacote_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  jogador_id bigint NOT NULL,
  pacote_id bigint NOT NULL,
  qtde_moedas bigint NOT NULL,
  preco double precision NOT NULL,
  data_hora_compra timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  status text NOT NULL,
  CONSTRAINT compra_pacote_pkey PRIMARY KEY (compra_pacote_id),
  CONSTRAINT pacote_jogador_jogador_id_fkey FOREIGN KEY (jogador_id) REFERENCES public.jogador(jogador_id),
  CONSTRAINT pacote_jogador_pacote_id_fkey FOREIGN KEY (pacote_id) REFERENCES public.pacote(pacote_id)
);
CREATE TABLE public.consumo_item (
  item_participacao_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  jogador_sala_rodada_id bigint NOT NULL,
  item_id bigint NOT NULL,
  qtde bigint NOT NULL,
  data_hora_consumo timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  CONSTRAINT consumo_item_pkey PRIMARY KEY (item_participacao_id),
  CONSTRAINT item_participacao_jogador_sala_rodada_id_fkey FOREIGN KEY (jogador_sala_rodada_id) REFERENCES public.jogador_sala_rodada_legado(jogador_sala_rodada_id),
  CONSTRAINT item_participacao_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.item(item_id)
);
CREATE TABLE public.convite (
  convite_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  jogador_convidante_id bigint NOT NULL,
  jogador_convidado_id bigint NOT NULL,
  sala_id bigint NOT NULL,
  data_hora_criacao timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  data_hora_fechamento timestamp with time zone,
  status text NOT NULL,
  CONSTRAINT convite_pkey PRIMARY KEY (convite_id),
  CONSTRAINT convite_jogador_convidante_id_fkey FOREIGN KEY (jogador_convidante_id) REFERENCES public.jogador(jogador_id),
  CONSTRAINT convite_jogador_convidado_id_fkey FOREIGN KEY (jogador_convidado_id) REFERENCES public.jogador(jogador_id),
  CONSTRAINT convite_sala_id_fkey FOREIGN KEY (sala_id) REFERENCES public.sala(sala_id)
);
CREATE TABLE public.feedback (
  feedback_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  jogador_id bigint,
  nome_jogador text,
  feedback_message text NOT NULL,
  feedback_type text NOT NULL CHECK (feedback_type = ANY (ARRAY['improvement'::text, 'bug_report'::text, 'compliment'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT feedback_pkey PRIMARY KEY (feedback_id),
  CONSTRAINT fk_jogador FOREIGN KEY (jogador_id) REFERENCES public.jogador(jogador_id)
);
CREATE TABLE public.fonte (
  fonte_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nome text NOT NULL,
  descricao text NOT NULL,
  url text NOT NULL,
  data_hora_criacao timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  CONSTRAINT fonte_pkey PRIMARY KEY (fonte_id)
);
CREATE TABLE public.inventario (
  inventario_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  jogador_id bigint NOT NULL,
  item_id bigint,
  qtde bigint NOT NULL,
  data_hora_ultima_atualizacao timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  CONSTRAINT inventario_pkey PRIMARY KEY (inventario_id),
  CONSTRAINT inventario_jogador_id_fkey FOREIGN KEY (jogador_id) REFERENCES public.jogador(jogador_id),
  CONSTRAINT inventario_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.item(item_id)
);
CREATE TABLE public.item (
  item_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nome text NOT NULL,
  descricao text NOT NULL,
  preco bigint NOT NULL,
  data_hora_criacao timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  status text NOT NULL,
  tipo text NOT NULL DEFAULT 'POWERUP'::text,
  codigo_identificador text UNIQUE,
  CONSTRAINT item_pkey PRIMARY KEY (item_id)
);
CREATE TABLE public.jogador (
  jogador_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nome_de_usuario text NOT NULL UNIQUE,
  email text NOT NULL UNIQUE,
  senha_hash text NOT NULL,
  data_hora_criacao timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  data_hora_ultima_vez_online timestamp with time zone,
  avatar_nome text,
  personagem_nome text,
  CONSTRAINT jogador_pkey PRIMARY KEY (jogador_id)
);
CREATE TABLE public.jogador_legado (
  jogador_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nome text NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  CONSTRAINT jogador_legado_pkey PRIMARY KEY (jogador_id),
  CONSTRAINT jogador_duplicate_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.jogador_sala (
  jogador_sala_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  jogador_id bigint NOT NULL,
  sala_id bigint NOT NULL,
  data_hora_entrada timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  data_hora_saida timestamp with time zone,
  status_jogador text DEFAULT 'jogando'::text,
  CONSTRAINT jogador_sala_pkey PRIMARY KEY (jogador_sala_id),
  CONSTRAINT jogador_sala_jogador_id_fkey FOREIGN KEY (jogador_id) REFERENCES public.jogador(jogador_id),
  CONSTRAINT jogador_sala_sala_id_fkey FOREIGN KEY (sala_id) REFERENCES public.sala(sala_id)
);
CREATE TABLE public.jogador_sala_rodada_legado (
  jogador_sala_rodada_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  jogador_sala bigint NOT NULL,
  data_hora_entrada timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  data_hora_saida timestamp with time zone,
  rodada_id bigint NOT NULL,
  CONSTRAINT jogador_sala_rodada_legado_pkey PRIMARY KEY (jogador_sala_rodada_id),
  CONSTRAINT jogador_sala_rodada_jogador_sala_fkey FOREIGN KEY (jogador_sala) REFERENCES public.jogador_sala(jogador_sala_id),
  CONSTRAINT jogador_sala_rodada_rodada_id_fkey FOREIGN KEY (rodada_id) REFERENCES public.rodada(rodada_id)
);
CREATE TABLE public.letra (
  letra_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  letra_caractere text NOT NULL UNIQUE,
  data_hora_criacao timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  CONSTRAINT letra_pkey PRIMARY KEY (letra_id)
);
CREATE TABLE public.letra_semZXYW (
  letra_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  letra_caractere text NOT NULL UNIQUE,
  data_hora_criacao timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  CONSTRAINT letra_semZXYW_pkey PRIMARY KEY (letra_id)
);
CREATE TABLE public.pacote (
  pacote_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nome text NOT NULL UNIQUE,
  descricao text NOT NULL UNIQUE,
  qtde_moedas bigint NOT NULL UNIQUE,
  preco double precision NOT NULL UNIQUE,
  data_hora_criacao timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  status text NOT NULL,
  CONSTRAINT pacote_pkey PRIMARY KEY (pacote_id)
);
CREATE TABLE public.participacao_rodada (
  participacao_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  rodada_id bigint NOT NULL,
  jogador_id bigint NOT NULL,
  tema_nome text NOT NULL,
  resposta text,
  pontos integer NOT NULL DEFAULT 0,
  data_hora_submissao timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT participacao_rodada_pkey PRIMARY KEY (participacao_id),
  CONSTRAINT participacao_rodada_rodada_id_fkey FOREIGN KEY (rodada_id) REFERENCES public.rodada(rodada_id),
  CONSTRAINT participacao_rodada_jogador_id_fkey FOREIGN KEY (jogador_id) REFERENCES public.jogador(jogador_id)
);
CREATE TABLE public.participacao_rodada_tema (
  resposta_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  jogador_sala_rodada_id bigint NOT NULL,
  rodada_tema_id bigint NOT NULL,
  resposta_base_id bigint,
  resposta_do_jogador text,
  resposta_do_jogador_normalizada text,
  data_hora_submissao timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  data_hora_validacao timestamp with time zone NOT NULL,
  status text NOT NULL,
  pontos bigint NOT NULL,
  CONSTRAINT participacao_rodada_tema_pkey PRIMARY KEY (resposta_id),
  CONSTRAINT participacao_rodada_tema_jogador_sala_rodada_id_fkey FOREIGN KEY (jogador_sala_rodada_id) REFERENCES public.jogador_sala_rodada_legado(jogador_sala_rodada_id),
  CONSTRAINT participacao_rodada_tema_rodada_tema_id_fkey FOREIGN KEY (rodada_tema_id) REFERENCES public.rodada_tema(rodada_tema_id),
  CONSTRAINT participacao_rodada_tema_resposta_base_id_fkey FOREIGN KEY (resposta_base_id) REFERENCES public.resposta_base(resposta_base_id)
);
CREATE TABLE public.password_reset (
  id bigint NOT NULL DEFAULT nextval('password_reset_id_seq'::regclass),
  jogador_id bigint NOT NULL,
  token text NOT NULL UNIQUE,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT password_reset_pkey PRIMARY KEY (id),
  CONSTRAINT password_reset_jogador_id_fkey FOREIGN KEY (jogador_id) REFERENCES public.jogador(jogador_id)
);
CREATE TABLE public.ranking (
  ranking_id integer NOT NULL DEFAULT nextval('ranking_ranking_id_seq'::regclass),
  jogador_id integer NOT NULL,
  sala_id integer NOT NULL,
  pontuacao_total integer NOT NULL DEFAULT 0,
  vencedor boolean NOT NULL DEFAULT false,
  data_partida timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ranking_pkey PRIMARY KEY (ranking_id),
  CONSTRAINT ranking_jogador_id_fkey FOREIGN KEY (jogador_id) REFERENCES public.jogador(jogador_id),
  CONSTRAINT ranking_sala_id_fkey FOREIGN KEY (sala_id) REFERENCES public.sala(sala_id)
);
CREATE TABLE public.resposta_base (
  resposta_base_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  letra_id bigint NOT NULL,
  tema_id bigint NOT NULL,
  texto text NOT NULL,
  fonte_id bigint NOT NULL,
  data_hora_criacao timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  CONSTRAINT resposta_base_pkey PRIMARY KEY (resposta_base_id),
  CONSTRAINT resposta_base2_tema_id_fkey FOREIGN KEY (tema_id) REFERENCES public.tema(tema_id),
  CONSTRAINT resposta_base2_letra_id_fkey FOREIGN KEY (letra_id) REFERENCES public.letra(letra_id),
  CONSTRAINT resposta_base2_fonte_id_fkey FOREIGN KEY (fonte_id) REFERENCES public.fonte(fonte_id)
);
CREATE TABLE public.resposta_base_legado (
  resposta_base_legado_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  tema_id bigint NOT NULL,
  letra_id bigint NOT NULL,
  texto text NOT NULL,
  data_hora_criacao timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  fonte_id bigint,
  CONSTRAINT resposta_base_legado_pkey PRIMARY KEY (resposta_base_legado_id),
  CONSTRAINT resposta_base_tema_id_fkey FOREIGN KEY (tema_id) REFERENCES public.tema(tema_id),
  CONSTRAINT resposta_base_letra_id_fkey FOREIGN KEY (letra_id) REFERENCES public.letra(letra_id)
);
CREATE TABLE public.rodada (
  rodada_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  sala_id bigint NOT NULL,
  letra_id bigint NOT NULL,
  numero_da_rodada bigint NOT NULL,
  data_hora_criacao timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  data_hora_fechamento timestamp with time zone,
  status text NOT NULL,
  tempo_id bigint NOT NULL,
  CONSTRAINT rodada_pkey PRIMARY KEY (rodada_id),
  CONSTRAINT rodada_sala_id_fkey FOREIGN KEY (sala_id) REFERENCES public.sala(sala_id),
  CONSTRAINT rodada_letra_id_fkey FOREIGN KEY (letra_id) REFERENCES public.letra(letra_id),
  CONSTRAINT rodada_tempo_id_fkey FOREIGN KEY (tempo_id) REFERENCES public.tempo(tempo_id)
);
CREATE TABLE public.rodada_tema (
  rodada_tema_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  rodada_id bigint NOT NULL,
  tema_id bigint NOT NULL,
  CONSTRAINT rodada_tema_pkey PRIMARY KEY (rodada_tema_id),
  CONSTRAINT rodada_tema_rodada_id_fkey FOREIGN KEY (rodada_id) REFERENCES public.rodada(rodada_id),
  CONSTRAINT rodada_tema_tema_id_fkey FOREIGN KEY (tema_id) REFERENCES public.tema(tema_id)
);
CREATE TABLE public.sala (
  sala_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  jogador_criador_id bigint NOT NULL,
  nome_sala text NOT NULL,
  data_hora_criacao timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  data_hora_fechamento timestamp with time zone,
  status text NOT NULL,
  letras_excluidas ARRAY,
  temas_excluidos ARRAY,
  CONSTRAINT sala_pkey PRIMARY KEY (sala_id),
  CONSTRAINT sala_jogador_criador_id_fkey FOREIGN KEY (jogador_criador_id) REFERENCES public.jogador(jogador_id)
);
CREATE TABLE public.tema (
  tema_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  tema_nome text NOT NULL UNIQUE,
  data_hora_criacao timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  CONSTRAINT tema_pkey PRIMARY KEY (tema_id)
);
CREATE TABLE public.tempo (
  tempo_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  valor bigint NOT NULL UNIQUE,
  data_hora_criacao timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  CONSTRAINT tempo_pkey PRIMARY KEY (tempo_id)
);