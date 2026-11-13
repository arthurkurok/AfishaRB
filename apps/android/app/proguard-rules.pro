# kotlinx.serialization: сгенерированные модели API и доменные снимки (Room JSON)
-keepattributes *Annotation*, InnerClasses, Signature, Exceptions
-keepclassmembers @kotlinx.serialization.Serializable class ** {
    *** Companion;
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class ru.tamasha.afisha.**$$serializer { *; }
-keepclassmembers class ru.tamasha.afisha.** {
    *** Companion;
}
# Типобезопасные маршруты Navigation (сериализуемые data-классы)
-keep class ru.tamasha.afisha.feature.**.*Route { *; }
-keep class ru.tamasha.afisha.feature.**.*Route$* { *; }

# Ktor / OkHttp
-dontwarn org.slf4j.**
-dontwarn io.ktor.util.debug.**
-dontwarn java.lang.management.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
