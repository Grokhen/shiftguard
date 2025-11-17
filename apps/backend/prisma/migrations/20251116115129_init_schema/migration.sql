-- CreateTable
CREATE TABLE "Delegaciones" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "codigo" VARCHAR(20),
    "pais_code" CHAR(2),
    "region_code" VARCHAR(50),
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Delegaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Roles_usuario" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,

    CONSTRAINT "Roles_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuarios" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "apellidos" VARCHAR(150) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT,
    "password_actualizada_en" TIMESTAMP(3),
    "ultimo_login" TIMESTAMP(3),
    "intentos_fallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueado_en" TIMESTAMP(3),
    "requiere_reset" BOOLEAN NOT NULL DEFAULT false,
    "rol_id" INTEGER NOT NULL,
    "delegacion_id" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipos" (
    "id" SERIAL NOT NULL,
    "nombre_equipo" VARCHAR(120) NOT NULL,
    "delegacion_id" INTEGER NOT NULL,

    CONSTRAINT "Equipos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Miembros_Equipo" (
    "equipo_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,

    CONSTRAINT "Miembros_Equipo_pkey" PRIMARY KEY ("equipo_id","usuario_id")
);

-- CreateTable
CREATE TABLE "Tipos_Permiso" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,

    CONSTRAINT "Tipos_Permiso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estados_Permiso" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,

    CONSTRAINT "Estados_Permiso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permisos" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "tipo_id" INTEGER NOT NULL,
    "estado_id" INTEGER NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE NOT NULL,
    "creado_por" INTEGER,
    "decidido_por" INTEGER,
    "observaciones" TEXT,

    CONSTRAINT "Permisos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Saldos_Permisos" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "anio" INTEGER NOT NULL,
    "tipo_id" INTEGER NOT NULL,
    "derecho" DECIMAL(5,2) NOT NULL,
    "arrastre" DECIMAL(5,2) NOT NULL DEFAULT 0,

    CONSTRAINT "Saldos_Permisos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guardias" (
    "id" SERIAL NOT NULL,
    "delegacion_id" INTEGER NOT NULL,
    "fecha_inicio" TIMESTAMP(3) NOT NULL,
    "fecha_fin" TIMESTAMP(3) NOT NULL,
    "estado" VARCHAR(20),
    "creado_por" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guardias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Roles_Guardia" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(50) NOT NULL,

    CONSTRAINT "Roles_Guardia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asignaciones_Guardia" (
    "id" SERIAL NOT NULL,
    "guardia_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "rol_guardia_id" INTEGER NOT NULL,

    CONSTRAINT "Asignaciones_Guardia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Delegaciones_nombre_key" ON "Delegaciones"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Delegaciones_codigo_key" ON "Delegaciones"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Roles_usuario_codigo_key" ON "Roles_usuario"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Usuarios_email_key" ON "Usuarios"("email");

-- CreateIndex
CREATE INDEX "Usuarios_rol_id_idx" ON "Usuarios"("rol_id");

-- CreateIndex
CREATE INDEX "Usuarios_delegacion_id_idx" ON "Usuarios"("delegacion_id");

-- CreateIndex
CREATE INDEX "Usuarios_delegacion_id_activo_idx" ON "Usuarios"("delegacion_id", "activo");

-- CreateIndex
CREATE INDEX "Equipos_delegacion_id_idx" ON "Equipos"("delegacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "Equipos_nombre_equipo_delegacion_id_key" ON "Equipos"("nombre_equipo", "delegacion_id");

-- CreateIndex
CREATE INDEX "Miembros_Equipo_usuario_id_idx" ON "Miembros_Equipo"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "Tipos_Permiso_codigo_key" ON "Tipos_Permiso"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Estados_Permiso_codigo_key" ON "Estados_Permiso"("codigo");

-- CreateIndex
CREATE INDEX "idx_permisos_usuario_inicio" ON "Permisos"("usuario_id", "fecha_inicio");

-- CreateIndex
CREATE INDEX "Permisos_estado_id_idx" ON "Permisos"("estado_id");

-- CreateIndex
CREATE INDEX "Permisos_tipo_id_idx" ON "Permisos"("tipo_id");

-- CreateIndex
CREATE UNIQUE INDEX "Saldos_Permisos_usuario_id_anio_tipo_id_key" ON "Saldos_Permisos"("usuario_id", "anio", "tipo_id");

-- CreateIndex
CREATE INDEX "Guardias_delegacion_id_fecha_inicio_idx" ON "Guardias"("delegacion_id", "fecha_inicio");

-- CreateIndex
CREATE UNIQUE INDEX "Roles_Guardia_codigo_key" ON "Roles_Guardia"("codigo");

-- CreateIndex
CREATE INDEX "Asignaciones_Guardia_usuario_id_idx" ON "Asignaciones_Guardia"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "Asignaciones_Guardia_guardia_id_usuario_id_key" ON "Asignaciones_Guardia"("guardia_id", "usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "Asignaciones_Guardia_guardia_id_rol_guardia_id_key" ON "Asignaciones_Guardia"("guardia_id", "rol_guardia_id");

-- AddForeignKey
ALTER TABLE "Usuarios" ADD CONSTRAINT "Usuarios_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "Roles_usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usuarios" ADD CONSTRAINT "Usuarios_delegacion_id_fkey" FOREIGN KEY ("delegacion_id") REFERENCES "Delegaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipos" ADD CONSTRAINT "Equipos_delegacion_id_fkey" FOREIGN KEY ("delegacion_id") REFERENCES "Delegaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Miembros_Equipo" ADD CONSTRAINT "Miembros_Equipo_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "Equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Miembros_Equipo" ADD CONSTRAINT "Miembros_Equipo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "Usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permisos" ADD CONSTRAINT "Permisos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "Usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permisos" ADD CONSTRAINT "Permisos_tipo_id_fkey" FOREIGN KEY ("tipo_id") REFERENCES "Tipos_Permiso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permisos" ADD CONSTRAINT "Permisos_estado_id_fkey" FOREIGN KEY ("estado_id") REFERENCES "Estados_Permiso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permisos" ADD CONSTRAINT "Permisos_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "Usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permisos" ADD CONSTRAINT "Permisos_decidido_por_fkey" FOREIGN KEY ("decidido_por") REFERENCES "Usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Saldos_Permisos" ADD CONSTRAINT "Saldos_Permisos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "Usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Saldos_Permisos" ADD CONSTRAINT "Saldos_Permisos_tipo_id_fkey" FOREIGN KEY ("tipo_id") REFERENCES "Tipos_Permiso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guardias" ADD CONSTRAINT "Guardias_delegacion_id_fkey" FOREIGN KEY ("delegacion_id") REFERENCES "Delegaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guardias" ADD CONSTRAINT "Guardias_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "Usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asignaciones_Guardia" ADD CONSTRAINT "Asignaciones_Guardia_guardia_id_fkey" FOREIGN KEY ("guardia_id") REFERENCES "Guardias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asignaciones_Guardia" ADD CONSTRAINT "Asignaciones_Guardia_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "Usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asignaciones_Guardia" ADD CONSTRAINT "Asignaciones_Guardia_rol_guardia_id_fkey" FOREIGN KEY ("rol_guardia_id") REFERENCES "Roles_Guardia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
